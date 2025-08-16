import { Terminal, Code, HelpCircle, Sparkles } from "lucide-react";

export default function EmptyState() {
  return (
    <div className="empty-state">
      <Sparkles className="empty-illustration" />
      <h3>Ready to track your AI sessions!</h3>
      <p>Use the <code>tally</code> command to wrap any AI tool and get notifications when it needs input.</p>
      <div className="usage-examples">
        <div className="usage-example">
          <h4><Terminal className="example-icon" /> Try it out:</h4>
          <code>cd ~/your-project</code>
          <code>tally claude</code>
        </div>
        <div className="usage-example">
          <h4><Code className="example-icon" /> Other AI tools:</h4>
          <code>tally gemini</code>
          <code>tally cursor-composer</code>
        </div>
      </div>
      <div className="empty-help">
        <HelpCircle className="help-icon" />
        <small>Sessions will appear here automatically when you start them</small>
      </div>
    </div>
  );
}