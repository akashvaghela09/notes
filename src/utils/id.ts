import { nanoid } from 'nanoid';

/** Generate a collision-resistant string id for a domain entity. */
export const newId = (): string => nanoid(16);
