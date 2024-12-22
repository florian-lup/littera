import { Icon } from '@/components/ui/Icon'
import { EditorInfo } from './EditorInfo'
import { EditorUser } from '../types'
import { WebSocketStatus } from '@hocuspocus/provider'
import { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { Sidebar } from '@/components/Sidebar'
import { ComposerButton } from '@/components/aiComposer/ComposerButton'
import { useCallback } from 'react'

export type EditorHeaderProps = {
  editor: Editor
  collabState: WebSocketStatus
  users: EditorUser[]
  onDrawerOpenChange: (isOpen: boolean) => void
}

export const EditorHeader = ({ editor, collabState, users, onDrawerOpenChange }: EditorHeaderProps) => {
  const { characters, words, limit } = useEditorState({
    editor,
    selector: ctx => {
      const characterCount = ctx.editor?.storage.characterCount
      return {
        characters: characterCount?.characters?.() ?? 0,
        words: characterCount?.words?.() ?? 0,
        limit: characterCount?.limit ?? 5000,
      }
    },
  })

  const handleAIAssistantClick = useCallback(() => {
    onDrawerOpenChange(true)
  }, [onDrawerOpenChange])

  return (
    <div className="flex flex-row items-center justify-between flex-none px-2 sm:px-6 py-2 text-black bg-white border-b border-neutral-200 dark:bg-black dark:text-white dark:border-neutral-800 z-[9999] relative">
      <div className="flex flex-row gap-x-1.5 items-center">
        <div className="flex items-center gap-x-1.5">
          <Sidebar editor={editor} />
        </div>
      </div>
      <div className="flex-shrink-0 mx-2">
        <ComposerButton onClick={handleAIAssistantClick} />
      </div>
      <div className="flex justify-end items-center">
        <EditorInfo characters={characters} words={words} limit={limit} collabState={collabState} users={users} />
      </div>
    </div>
  )
}
