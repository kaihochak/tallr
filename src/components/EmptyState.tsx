import { useState, useCallback } from "react";
import { Terminal, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function EmptyState() {
  const [copied, setCopied] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState("claude");

  const handleCopyCommand = useCallback(() => {
    const command = `tallor ${selectedAgent}`;
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [selectedAgent]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 animate-fadeIn">
      <h3 className="text-2xl font-semibold text-text-primary mb-3 m-0">No active sessions</h3>
      <p className="text-text-secondary text-base mb-8 m-0 max-w-[400px]">
        Wrap your AI CLI tools with tallor to get notified when they need input
      </p>
      
      <div className="bg-bg-card p-6 rounded-xl border border-border-primary shadow-sm max-w-[360px] w-full">
        <div className="flex items-center gap-3 mb-4">
          <Terminal className="w-5 h-5 text-accent-primary" />
          <span className="text-sm font-medium text-text-primary">Get started</span>
        </div>
        
        <div className="mb-4">
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="w-full border-border-primary bg-bg-card text-text-primary text-sm font-medium hover:border-border-secondary hover:bg-bg-hover cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="cursor-pointer">
              <SelectItem value="claude" className="cursor-pointer">Claude Code CLI</SelectItem>
              <SelectItem value="gemini" className="cursor-pointer">Gemini CLI</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="relative">
          <code className="block font-mono text-sm bg-bg-tertiary px-4 py-3 rounded-lg text-accent-primary border border-border-light pr-12">
            tallor {selectedAgent}
          </code>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopyCommand}
            className="absolute top-2 right-2 h-7 w-7 text-text-secondary hover:text-text-primary"
            title="Copy command"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </Button>
        </div>
      </div>
      
      <p className="text-xs text-text-tertiary mt-6 flex items-center gap-1">
        Sessions appear here automatically
      </p>
    </div>
  );
}