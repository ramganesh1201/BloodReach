import React, { useState, useRef } from 'react';
import { MessageAttachment } from '../../types';
import {
  Send,
  Paperclip,
  X,
  FileText,
  CloudOff,
  Sparkles,
  Lock,
} from 'lucide-react';

interface MessageComposerProps {
  onSendMessage: (content: string, attachments?: MessageAttachment[]) => Promise<void>;
  isOffline?: boolean;
  isReadOnly?: boolean;
  readOnlyMessage?: string;
}

const QUICK_RESPONSES = [
  'I am at the hospital transfusion desk.',
  'Please confirm patient bed and floor.',
  'Transfusion desk requires patient ID card.',
  'Estimated arrival in 15 minutes.',
];

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSendMessage,
  isOffline = false,
  isReadOnly = false,
  readOnlyMessage,
}) => {
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState<MessageAttachment | null>(null);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (isReadOnly) {
    return (
      <div className="border-t border-[#E6E9E7] bg-[#F8F9F8] p-3.5 sm:p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-xs font-semibold text-[#69716F]">
          <Lock className="w-4 h-4 text-[#69716F] shrink-0" />
          <span>
            {readOnlyMessage ||
              'This emergency coordination case is completed. Chat history is preserved in read-only mode.'}
          </span>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!text.trim() && !selectedFile) || isSending) return;

    try {
      setIsSending(true);
      const attachments = selectedFile ? [selectedFile] : undefined;
      await onSendMessage(text.trim(), attachments);
      setText('');
      setSelectedFile(null);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File size exceeds 10MB clinical coordination limit.');
      return;
    }

    const mockAttachment: MessageAttachment = {
      id: `att-${Date.now()}`,
      storagePath: URL.createObjectURL(file),
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      publicUrl: URL.createObjectURL(file),
    };

    setSelectedFile(mockAttachment);
  };

  return (
    <div className="border-t border-[#E6E9E7] bg-white p-2.5 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2.5 shadow-sm">
      {/* Offline Status Notice */}
      {isOffline && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs">
          <CloudOff className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Offline mode active. Your message will be preserved locally and queued for automatic sync.</span>
        </div>
      )}

      {/* Quick Response Chips */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-none">
        <span className="text-[10px] sm:text-[11px] font-semibold text-[#69716F] flex items-center gap-1 shrink-0">
          <Sparkles className="w-3 h-3 text-[#B42332]" />
          Quick updates:
        </span>
        {QUICK_RESPONSES.map((phrase, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setText(phrase)}
            className="text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full bg-[#F8F9F8] hover:bg-[#F0F2F0] border border-[#E6E9E7] text-[#202322] whitespace-nowrap transition-colors shrink-0 active:scale-95"
          >
            {phrase}
          </button>
        ))}
      </div>

      {/* File Attachment Chip */}
      {selectedFile && (
        <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#F8F9F8] border border-[#E6E9E7] max-w-sm">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-[#B42332] shrink-0" />
            <span className="text-xs font-semibold text-[#202322] truncate">
              {selectedFile.fileName}
            </span>
            <span className="text-[10px] text-[#69716F]">
              ({(selectedFile.fileSize / 1024).toFixed(0)} KB)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedFile(null)}
            className="p-1 rounded-full hover:bg-zinc-200 text-[#69716F]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Composer Bar */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Attach document or prescription (max 10MB)"
          className="min-h-[44px] min-w-[44px] p-2.5 rounded-xl border border-[#E6E9E7] bg-[#F8F9F8] hover:bg-[#F0F2F0] text-[#69716F] hover:text-[#202322] transition-colors shrink-0 flex items-center justify-center"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        <div className="flex-1 relative">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type your emergency message... (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="w-full resize-none py-2.5 px-3.5 text-xs sm:text-sm rounded-xl bg-[#F8F9F8] border border-[#E6E9E7] text-[#202322] placeholder:text-[#69716F] focus:outline-none focus:ring-1 focus:ring-[#B42332] focus:border-[#B42332] max-h-32 min-h-[44px]"
          />
        </div>

        <button
          type="submit"
          disabled={(!text.trim() && !selectedFile) || isSending}
          className="min-h-[44px] min-w-[44px] p-2.5 rounded-xl bg-[#B42332] hover:bg-[#8F1928] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shrink-0 flex items-center justify-center active:scale-95"
          aria-label="Send message"
        >
          {isSending ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </form>
    </div>
  );
};

