import { AgentConsole } from "../../../components/AgentConsole";

export default function AgentPage() {
  return (
    <>
      <header className="page-header">
        <h2>Ask the discovery agent</h2>
        <p>Explore the collected Teams evidence using the configured ask-agent provider.</p>
      </header>
      <AgentConsole />
    </>
  );
}
