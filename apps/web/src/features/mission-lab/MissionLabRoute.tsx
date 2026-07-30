import { MISSION_GAME_BY_ROUTE } from "./curricula";
import { MissionLabGame } from "./MissionLabGame";

export function MissionLabRoute() {
  const definition = MISSION_GAME_BY_ROUTE.get(window.location.pathname);
  if (!definition) return null;
  return <MissionLabGame definition={definition} />;
}
