import { ChevronDown, ChevronUp } from "lucide-react";

interface TaskDetailProps {
  details: string;
  isExpanded: boolean;
  onToggleExpanded: (e: React.MouseEvent) => void;
}

export default function TaskDetail({ details, isExpanded, onToggleExpanded }: TaskDetailProps) {
  return (
    <div className="w-full mt-1">
      {/* Header with expand toggle on the right */}
      {details.length > 100 && (
        <div className="flex justify-end mb-1">
          <button 
            className="flex items-center justify-center w-6 h-6 border-none rounded bg-transparent text-text-tertiary cursor-pointer transition-all duration-200 flex-shrink-0 hover:bg-bg-hover hover:text-text-primary hover:scale-105"
            title={isExpanded ? "Show less" : "Show more"} 
            onClick={onToggleExpanded}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      )}
      
      {/* Details content */}
      <div className={`text-text-secondary font-mono text-xs leading-relaxed break-words transition-all duration-200 ${
        isExpanded ? 'whitespace-pre-wrap overflow-visible max-h-none' : 'whitespace-pre-wrap overflow-hidden max-h-[54px]'
      }`}>
        {details}
      </div>
    </div>
  );
}