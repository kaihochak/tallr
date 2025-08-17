import { ChevronDown, ChevronUp } from "lucide-react";

interface TaskDetailProps {
  details: string;
  isExpanded: boolean;
  onToggleExpanded: (e: React.MouseEvent) => void;
}

export default function TaskDetail({ details, isExpanded, onToggleExpanded }: TaskDetailProps) {
  return (
    <div className="w-full mt-1">
      <div className="flex items-start gap-2">
        <div className={`flex-1 text-text-secondary font-mono text-xs leading-relaxed break-words transition-all duration-200 ${
          isExpanded ? 'whitespace-pre-wrap overflow-visible max-h-none' : 'whitespace-pre-wrap overflow-hidden max-h-[54px]'
        }`}>
          {details}
        </div>
        
        {details.length > 100 && (
          <button 
            className="flex items-center justify-center w-6 h-6 border-none rounded bg-transparent text-text-tertiary cursor-pointer transition-all duration-200 flex-shrink-0 hover:bg-bg-hover hover:text-text-primary hover:scale-105 mt-0.5"
            title={isExpanded ? "Show less" : "Show more"} 
            onClick={onToggleExpanded}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}