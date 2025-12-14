export enum ShapeType {
  GALAXY = 'GALAXY',
  TREE = 'TREE'
}

export interface ParticleData {
  positions: Float32Array;
  colors: Float32Array;
}

export interface GestureState {
  isPinching: boolean;
  isLoading: boolean;
  error: string | null;
}