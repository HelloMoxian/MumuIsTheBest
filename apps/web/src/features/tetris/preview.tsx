import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../styles.css";
import { TetrisGame } from "./TetrisGame";

// Independent development entry while other games are integrating the shared home page.
createRoot(document.getElementById("root")!).render(<StrictMode><TetrisGame /></StrictMode>);
