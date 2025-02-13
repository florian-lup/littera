import { useState, useCallback, useRef, useEffect } from 'react'
import { ArrowUp, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { useMediaQuery } from '@/hooks/useMediaQuery'

interface ChatInputProps {
  onSend: (message: string) => void
  onClear: () => void
  isLoading: boolean
}

export const ChatInput = ({ onSend, onClear, isLoading }: ChatInputProps) => {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isMobile = useMediaQuery('(max-width: 768px)')

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      // Adjust max height based on device
      const maxHeight = isMobile ? 120 : 200
      const newHeight = Math.min(textarea.scrollHeight, maxHeight)
      textarea.style.height = `${Math.max(44, newHeight)}px` // Slightly smaller min height on mobile
    }
  }, [isMobile])

  useEffect(() => {
    adjustHeight()
  }, [message, isMobile, adjustHeight])

  // Focus the textarea when the component mounts on desktop
  useEffect(() => {
    if (!isMobile && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isMobile])

  const handleSend = useCallback(() => {
    if (!message.trim() || isLoading) return
    onSend(message)
    setMessage('')
    // Reset height after sending
    if (textareaRef.current) {
      textareaRef.current.style.height = isMobile ? '44px' : '50px'
      textareaRef.current.focus()
    }
  }, [message, isLoading, onSend, isMobile])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Only use Enter to send on desktop
      if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend, isMobile],
  )

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value)
  }, [])

  // Handle touch events for better mobile interaction
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = 'scale(0.95)'
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = 'scale(1)'
  }, [])

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          'p-2 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900',
          'sticky bottom-0',
        )}
      >
        <div className={cn('bg-neutral-100 dark:bg-neutral-800 rounded-[4px] overflow-hidden', 'shadow-sm')}>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={isMobile ? 'Type message...' : 'Type your message...'}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className={cn(
              'w-full p-3',
              'text-[16px] leading-[1.3]', // Ensure 16px font size to prevent zoom
              'bg-transparent',
              'border-none',
              'placeholder:text-neutral-500 dark:placeholder:text-neutral-400',
              'focus:outline-none',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'resize-none break-words overflow-x-hidden transition-[height]',
              'md:text-sm md:leading-normal', // Smaller text on desktop
              'touch-manipulation', // Improves touch response
            )}
            disabled={isLoading}
          />
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2">{/* Space for future buttons */}</div>
            <button
              onClick={handleSend}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              disabled={!message.trim() || isLoading}
              className={cn(
                'flex items-center justify-center',
                'rounded-full',
                'w-10 h-10 md:w-8 md:h-8', // Larger touch target on mobile
                'bg-blue-500',
                'enabled:hover:bg-blue-600',
                'enabled:active:bg-blue-700',
                'disabled:bg-neutral-200 dark:disabled:bg-neutral-700',
                'disabled:cursor-not-allowed',
                'transition-all duration-200',
                'transform enabled:hover:scale-105 enabled:active:scale-95',
                'text-white disabled:text-neutral-400',
                'shadow-sm enabled:hover:shadow-md',
                'touch-manipulation', // Improves touch response
              )}
              aria-label="Send message"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 md:w-4 md:h-4 animate-spin" />
              ) : (
                <ArrowUp className="w-5 h-5 md:w-4 md:h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
