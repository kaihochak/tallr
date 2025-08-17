import { Terminal, Code, HelpCircle, Sparkles } from "lucide-react";

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-10 animate-fadeIn">
      <Sparkles className="w-48 h-48 mb-6 text-accent-primary opacity-20 animate-pulse-slow" />
      <h3 className="text-2xl font-bold text-text-primary mb-3 m-0">Ready to track your AI sessions!</h3>
      <p className="text-text-secondary text-base max-w-[500px] mb-8 m-0">
        Use the <code className="bg-bg-tertiary px-1.5 py-0.5 rounded font-mono text-sm text-accent-primary border border-border-primary">tally</code> command to wrap any AI tool and get notifications when it needs input.
      </p>
      <div className="flex gap-6 my-8 justify-center flex-wrap">
        <div className="text-left bg-bg-card p-5 rounded-xl border border-border-primary transition-all duration-200 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-accent-primary">
          <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-3 m-0">
            <Terminal className="w-4.5 h-4.5 text-accent-primary" />
            Try it out:
          </h4>
          <code className="block font-mono text-sm bg-bg-tertiary px-3 py-2.5 rounded-md my-1.5 text-accent-primary border border-border-light transition-all duration-200 hover:bg-bg-hover hover:border-accent-primary">
            cd ~/your-project
          </code>
          <code className="block font-mono text-sm bg-bg-tertiary px-3 py-2.5 rounded-md my-1.5 text-accent-primary border border-border-light transition-all duration-200 hover:bg-bg-hover hover:border-accent-primary">
            tally claude
          </code>
        </div>
        <div className="text-left bg-bg-card p-5 rounded-xl border border-border-primary transition-all duration-200 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-accent-primary">
          <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-3 m-0">
            <Code className="w-4.5 h-4.5 text-accent-primary" />
            Other AI tools:
          </h4>
          <code className="block font-mono text-sm bg-bg-tertiary px-3 py-2.5 rounded-md my-1.5 text-accent-primary border border-border-light transition-all duration-200 hover:bg-bg-hover hover:border-accent-primary">
            tally gemini
          </code>
          <code className="block font-mono text-sm bg-bg-tertiary px-3 py-2.5 rounded-md my-1.5 text-accent-primary border border-border-light transition-all duration-200 hover:bg-bg-hover hover:border-accent-primary">
            tally cursor-composer
          </code>
        </div>
      </div>
      <div className="text-sm text-text-tertiary mt-6 flex items-center gap-2">
        <HelpCircle className="w-4 h-4" />
        <small>Sessions will appear here automatically when you start them</small>
      </div>
    </div>
  );
}