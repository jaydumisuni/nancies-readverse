import { avatars as groupA } from "./avatarsA";
import { avatars as groupB } from "./avatarsB";
import { avatars as groupC } from "./avatarsC";
import { avatars as groupD } from "./avatarsD";

const { meimei, ...groupDRest } = groupD;

export const avatarImages = {
  ...groupA,
  ...groupB,
  ...groupC,
  ...groupDRest,
  meiMei: meimei,
} as const;

export type AvatarId = keyof typeof avatarImages;
