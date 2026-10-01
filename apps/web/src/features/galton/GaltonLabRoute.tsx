import { ArrowLeft, RadioTower } from "lucide-react";
import { GaltonLabPage } from "./GaltonLabPage";

export function GaltonLabRoute() {
  return (
    <div className="standalone-lab">
      <header className="standalone-lab-header">
        <a href="/lab/galton" className="standalone-lab-brand"><RadioTower size={21} /> <strong>getOPS</strong></a>
        <span>Probability lab</span>
        <a href="/" className="button"><ArrowLeft size={15} /> Workspace</a>
      </header>
      <main><GaltonLabPage /></main>
    </div>
  );
}
