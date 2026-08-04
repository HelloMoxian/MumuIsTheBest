import type {
  RecipeRequirement,
  ResourceGroupKey,
  WorldTowerManifest,
  WorldTowerNode,
  WorldTowerProgress,
  WorldTowerRecipe,
  WorldTowerResource,
} from "./types";

export type FrameQuality = "common" | "rare" | "epic" | "legendary";

export function frameQualityForLevel(levelOrder: number): FrameQuality {
  if (levelOrder >= 12) return "legendary";
  if (levelOrder >= 8) return "epic";
  if (levelOrder >= 4) return "rare";
  return "common";
}

export function visibleNodeName(node: WorldTowerNode) {
  return node.isUnlocked ? node.name : "未发现";
}

export function resourceCount(
  resource: WorldTowerResource,
  progress: WorldTowerProgress,
): number | "permanent" | "state" {
  if (resource.inventoryMode === "charge") {
    return progress.resourceInventory[resource.id] ?? 0;
  }
  if (resource.inventoryMode === "permanent-unlock") {
    return progress.permanentResourceIds.includes(resource.id) ? "permanent" : 0;
  }
  return "state";
}

export function hasRequirement(
  resource: WorldTowerResource,
  requirement: RecipeRequirement,
  progress: WorldTowerProgress,
) {
  const count = resourceCount(resource, progress);
  if (count === "state" || count === "permanent") return true;
  return count >= requirement.amount;
}

const resourceGroupOrder: ResourceGroupKey[] = [
  "actions",
  "conditions",
  "environments",
  "knowledge",
];

export function recipeRequirements(
  recipe: WorldTowerRecipe | undefined,
  resourcesById: ReadonlyMap<string, WorldTowerResource>,
) {
  if (!recipe) return [];
  return resourceGroupOrder.flatMap((group) =>
    recipe.requirements[group].map((requirement) => ({
      group,
      requirement,
      resource: resourcesById.get(requirement.resourceId) ?? null,
    })),
  );
}

export function buildResourceMap(manifest: WorldTowerManifest) {
  return new Map(
    Object.values(manifest.resources)
      .flat()
      .map((resource) => [resource.id, resource] as const),
  );
}
