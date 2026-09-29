import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../styles.css";
import { LearningCoinLayer } from "../../shared/LearningCoinLayer";
import { TetrisGame } from "./TetrisGame";

// Independent development entry while other games are integrating the shared home page.
createRoot(document.getElementById("root")!).render(<StrictMode><LearningCoinLayer><TetrisGame /></LearningCoinLayer></StrictMode>);
