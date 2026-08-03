import type { CSSProperties } from "react";
import type { ReactionCompound } from "./logic";
import { MoleculeStructurePreview } from "./MoleculeStructurePreview";

export function CompoundReferenceImage({
  compound,
  className = "",
}: {
  compound: ReactionCompound;
  className?: string;
}) {
  const image = compound.image;
  if (!image) {
    return (
      <figure className={`compound-reference-image is-schematic ${className}`.trim()}>
        <MoleculeStructurePreview compound={compound} />
        <figcaption>知识库组成示意</figcaption>
      </figure>
    );
  }

  const column = image.atlasIndex % image.columns;
  const row = Math.floor(image.atlasIndex / image.columns);
  const backgroundPositionX = image.columns === 1 ? 0 : (column / (image.columns - 1)) * 100;
  const backgroundPositionY = image.rows === 1 ? 0 : (row / (image.rows - 1)) * 100;
  const style = {
    backgroundImage: `url(${image.path})`,
    backgroundSize: `${image.columns * 100}% ${image.rows * 100}%`,
    backgroundPosition: `${backgroundPositionX}% ${backgroundPositionY}%`,
  } as CSSProperties;

  return (
    <figure className={`compound-reference-image ${className}`.trim()}>
      <span role="img" aria-label={image.alt} style={style} />
      <figcaption>
        <a href={image.sourceUrl} target="_blank" rel="noreferrer">PubChem 2D 结构图</a>
      </figcaption>
    </figure>
  );
}
