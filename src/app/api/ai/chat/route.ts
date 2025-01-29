import { NextResponse } from 'next/server'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { RunnableSequence } from '@langchain/core/runnables'
import { ChatPromptTemplate, MessagesPlaceholder, PromptTemplate } from '@langchain/core/prompts'
import { BufferMemory } from 'langchain/memory'
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages'
import { initializeAIModel, createStreamingResponse } from '../utils'

// Memory storage to persist conversations between requests
const memoryStorage = new Map<string, EnhancedBufferMemory>()

// Debug logging function
const debug = (message: string, data?: any) => {
  console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '')
}

// Constants
const MESSAGE_COUNT_THRESHOLD = 3 // Changed from 10 to 3 for testing

// Helper function to format message for conversation text
const formatMessage = (message: BaseMessage) => {
  let role = 'System'
  if (message instanceof HumanMessage) role = 'User'
  if (message instanceof AIMessage) role = 'Assistant'
  return `${role}: ${message.content}`
}

// Prompt for summarizing conversation history
const summarizePrompt = PromptTemplate.fromTemplate(`
Summarize the following conversation in a concise way. Focus on key points and decisions made.
Keep the summary under 200 words.

Conversation:
{conversation}

Summary:`)

// Prompt for tagging messages
const tagPrompt = PromptTemplate.fromTemplate(`
Analyze this message and provide up to 3 relevant tags. Tags should be single words or short phrases
that capture the main topics, intents, or emotions in the message.
Respond with ONLY the tags, separated by commas.

Message:
{message}

Tags:`)

// Enhanced memory with summarization and tagging
class EnhancedBufferMemory extends BufferMemory {
  private summarizer: RunnableSequence
  private tagger: RunnableSequence
  private model: any
  private messageCount: number = 0
  private sessionId: string

  constructor(model: any, options: any, sessionId: string) {
    super(options)
    this.model = model
    this.sessionId = sessionId
    debug(`Initializing EnhancedBufferMemory for session ${sessionId}`)

    // Initialize summarizer chain
    this.summarizer = RunnableSequence.from([
      {
        conversation: (input: any) => input,
      },
      summarizePrompt,
      this.model,
      new StringOutputParser(),
    ])

    // Initialize tagger chain
    this.tagger = RunnableSequence.from([
      {
        message: (input: any) => input,
      },
      tagPrompt,
      this.model,
      new StringOutputParser(),
    ])
  }

  async saveContext(inputValues: any, outputValues: any): Promise<void> {
    this.messageCount++
    debug(
      `Saving context for session ${this.sessionId}. Message count: ${this.messageCount}/${MESSAGE_COUNT_THRESHOLD}`,
    )

    try {
      // Get tags for the input message
      const tags = await this.tagger.invoke(inputValues.input)
      debug('Generated tags:', tags)

      // Create enhanced messages with tags
      const enhancedInput = new HumanMessage({
        content: inputValues.input,
        additional_kwargs: { tags: tags.split(',').map((t: string) => t.trim()) },
      })

      const enhancedOutput = new AIMessage({
        content: outputValues.output,
        additional_kwargs: { tags: [] },
      })

      // Add to memory
      await super.saveContext({ input: enhancedInput }, { output: enhancedOutput })
      debug('Saved messages to memory')

      // Check if we need to summarize
      const memoryVariables = await this.loadMemoryVariables({})
      const chatHistory = memoryVariables.chat_history || []
      debug('Current chat history length:', chatHistory.length)

      if (this.messageCount >= MESSAGE_COUNT_THRESHOLD) {
        debug('Starting conversation summarization')
        // Summarize after threshold is reached
        const conversationText = chatHistory.map((msg: BaseMessage) => formatMessage(msg)).join('\n')
        debug('Conversation to summarize:', conversationText)

        const summary = await this.summarizer.invoke(conversationText)
        debug('Generated summary:', summary)

        // Clear old messages and add summary as system message
        await this.clear()
        this.messageCount = 0
        await super.saveContext(
          { input: new SystemMessage(summary) },
          { output: new AIMessage('Summary processed and saved to memory') },
        )
        debug('Saved summary to memory')
      }
    } catch (error) {
      console.error('Error in saveContext:', error)
      throw error
    }
  }

  async loadMemoryVariables(inputs: any): Promise<{ [key: string]: any }> {
    const variables = await super.loadMemoryVariables(inputs)
    debug(`Loading memory variables for session ${this.sessionId}:`, {
      history: variables.chat_history?.map((msg: BaseMessage) => ({
        role: msg instanceof HumanMessage ? 'user' : msg instanceof AIMessage ? 'assistant' : 'system',
        content: msg.content,
      })),
    })
    return variables
  }
}

const chatPrompt = ChatPromptTemplate.fromMessages([new MessagesPlaceholder('chat_history'), ['human', '{input}']])

// Create a generator for streaming responses
const createResponseGenerator = (response: string) => {
  return async function* () {
    yield response
  }
}

export async function POST(req: Request) {
  try {
    const { message, modelName, temperature = 0.5, sessionId } = await req.json()
    debug('Received request:', { message, modelName, temperature, sessionId })

    if (!message || !modelName || !sessionId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const model = initializeAIModel(modelName, temperature)

    // Get or create memory for this session
    let memory = memoryStorage.get(sessionId)
    if (!memory) {
      debug('Creating new memory for session:', sessionId)
      memory = new EnhancedBufferMemory(
        model,
        {
          returnMessages: true,
          memoryKey: 'chat_history',
          inputKey: 'input',
          outputKey: 'output',
        },
        sessionId,
      )
      memoryStorage.set(sessionId, memory)
    } else {
      debug('Found existing memory for session:', sessionId)
    }

    // Load current chat history
    const currentHistory = await memory.loadMemoryVariables({})
    debug('Current chat history:', {
      messages: currentHistory.chat_history?.map((msg: BaseMessage) => ({
        role: msg instanceof HumanMessage ? 'user' : msg instanceof AIMessage ? 'assistant' : 'system',
        content: msg.content,
      })),
    })

    const chain = RunnableSequence.from([
      {
        input: (input: { message: string }) => input.message,
        chat_history: async () => {
          const memoryVariables = await memory!.loadMemoryVariables({})
          return memoryVariables.chat_history || []
        },
      },
      chatPrompt,
      model,
      new StringOutputParser(),
    ])

    // Add retry logic
    let attempts = 0
    const maxAttempts = 3
    let response: string | undefined

    while (attempts < maxAttempts) {
      try {
        debug(`Attempt ${attempts + 1} to generate response`)
        response = await chain.invoke({ message })
        debug('Generated response:', response)
        break
      } catch (error) {
        attempts++
        console.error(`Attempt ${attempts} failed:`, error)
        if (attempts === maxAttempts) throw error
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000))
      }
    }

    if (!response) {
      throw new Error('Failed to generate response')
    }

    // Save the interaction to memory with the actual response
    debug('Saving interaction to memory')
    await memory.saveContext({ input: message }, { output: response })

    // Log memory state after saving
    const updatedHistory = await memory.loadMemoryVariables({})
    debug('Updated chat history:', {
      messages: updatedHistory.chat_history?.map((msg: BaseMessage) => ({
        role: msg instanceof HumanMessage ? 'user' : msg instanceof AIMessage ? 'assistant' : 'system',
        content: msg.content,
      })),
    })

    return createStreamingResponse(createResponseGenerator(response)())
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 })
  }
}
