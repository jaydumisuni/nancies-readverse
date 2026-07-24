import { avatars as groupA } from "./avatarsA";
import { avatars as groupB } from "./avatarsB";
import { avatars as groupC } from "./avatarsC";
import { avatars as groupD } from "./avatarsD";

export const avatarImages = {
  ...groupA,
  ...groupB,
  ...groupC,
  ...groupD,
  mei: groupD.meiMei,
} as const;

export type AvatarId = keyof typeof avatarImages;
