import { BookOpen, Network } from "lucide-react";
import { Link } from "react-router";

export function LearningTracks({ active }: { active: "operations" | "infrastructure" }) {
  return (
    <nav className="learning-tracks" aria-label="Learning tracks">
      <Link to="/learn" aria-current={active === "operations" ? "page" : undefined}>
        <BookOpen size={17} /><span>Trading operations</span><small>09 branches</small>
      </Link>
      <Link to="/learn/infrastructure" aria-current={active === "infrastructure" ? "page" : undefined}>
        <Network size={17} /><span>Systems & infrastructure</span><small>08 modules</small>
      </Link>
    </nav>
  );
}
