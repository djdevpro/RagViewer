// Shared low-saturation palette so a chunk has the SAME colour in the HTML
// boundary overlay and as its node in the embedding cloud.
export const CHUNK_PALETTE = [
  "#6b7cff",
  "#e0a458",
  "#52b788",
  "#e06c75",
  "#56b6c2",
  "#c678dd",
  "#d19a66",
  "#98c379",
  "#61afef",
  "#be8abf",
];

export const chunkColor = (index: number): string => CHUNK_PALETTE[index % CHUNK_PALETTE.length];
