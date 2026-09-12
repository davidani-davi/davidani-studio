import Link from "next/link";
import StudioHeader from "@/components/StudioHeader";
import { STUDIO_TOOLS } from "@/lib/studio-navigation";

export default function StudioHome() {
  return (
    <main className="paper-home">
      <StudioHeader active="home" title="Your workspace" subtitle="Photography, design, and the season ahead." />
      <div className="paper-home-sheet">
        <section className="paper-home-intro">
          <p className="paper-label">Davi &amp; Dani</p>
          <h2>A place for the whole collection.</h2>
          <p>Develop a direction, photograph the details, and prepare what comes next.</p>
        </section>
        <div className="paper-home-workspaces">
          <Link href="/" className="paper-workspace-card">
            <span className="paper-label">01 / Photography</span>
            <h3>Studio</h3><p>Product photos, your models, and consistent campaign shoots.</p>
            <span className="paper-open">Open Studio →</span>
          </Link>
          <Link href="/creative-lab" className="paper-workspace-card">
            <span className="paper-label">02 / Exploration</span>
            <h3>Creative Lab</h3><p>One brief, several image models. Compare directions and reuse the ones you like.</p>
            <span className="paper-open">Open Creative Lab →</span>
          </Link>
          <a href="https://davidani-season-plan.vercel.app" target="_blank" rel="noopener noreferrer" className="paper-workspace-card">
            <span className="paper-label">03 / Direction</span>
            <h3>Season Plan</h3><p>Seasonal briefs, selling colors, bestsellers, and upcoming deadlines.</p>
            <span className="paper-open">Open Season Plan ↗</span>
          </a>
          <a href="https://davidani-playground.vercel.app" target="_blank" rel="noopener noreferrer" className="paper-workspace-card">
            <span className="paper-label">04 / Development</span>
            <h3>Playground</h3><p>Sketch ideas, work with prints and garment bodies, and develop collections.</p>
            <span className="paper-open">Open Playground ↗</span>
          </a>
        </div>
        <p className="paper-external-note">Season Plan and Playground open in their existing apps and keep their own sign-in.</p>
        <section className="paper-home-tools">
          <h2>Studio tools</h2>
          <div>{STUDIO_TOOLS.map((tool) => <Link key={tool.id} href={tool.href}><span>{tool.label}</span><p>{tool.description}</p><span aria-hidden="true">↗</span></Link>)}</div>
        </section>
      </div>
    </main>
  );
}
