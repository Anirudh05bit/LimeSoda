/**
 * Minimal type augmentations for @nitrostack/core.
 *
 * Only adds fields missing from the published v1.0.13 types.
 * Does NOT re-declare any exports — interface merging only.
 */
export {};

declare module '@nitrostack/core' {
  interface AuthContext {
    role?: string;
  }

}
