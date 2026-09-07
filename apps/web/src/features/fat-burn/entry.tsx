import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../styles.css";
import { FatBurnPage } from "./FatBurnPage";

// A separate application root: no child-game shell, wallet, keyboard or global music.
createRoot(document.getElementById("root")!).render(<StrictMode><FatBurnPage /></StrictMode>);
