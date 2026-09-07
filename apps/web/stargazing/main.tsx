import { createRoot } from "react-dom/client";
import { StargazingPage } from "../src/features/stargazing/StargazingPage";
import "../src/styles.css";

const homeHref = import.meta.env.DEV ? "http://localhost:5173/#nature-title" : "/#nature-title";
createRoot(document.getElementById("root")!).render(<StargazingPage homeHref={homeHref} />);
