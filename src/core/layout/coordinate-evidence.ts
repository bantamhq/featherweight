import type { PhysicalTextLine } from "../physical-lines.js";

export interface CoordinateEvidence {
  readonly x: number | null;
  readonly conflicting: boolean;
}

export interface PageCoordinateObservation {
  readonly x: number;
  readonly pageIndex: number;
}

interface CoordinateCluster {
  readonly values: number[];
}

export function resolveCoordinateEvidence(
  values: readonly number[],
  coordinateTolerance: number,
): CoordinateEvidence {
  const clusters = [...clusterCoordinates(values, coordinateTolerance)].sort(
    (left, right) =>
      right.values.length - left.values.length ||
      average(left.values) - average(right.values),
  );
  const dominantCluster = clusters[0];

  if (dominantCluster === undefined) {
    return { x: null, conflicting: false };
  }

  const competingCluster = clusters[1];

  if (
    competingCluster !== undefined &&
    competingCluster.values.length === dominantCluster.values.length
  ) {
    return { x: null, conflicting: true };
  }

  const conflicting =
    competingCluster !== undefined &&
    competingCluster.values.length >= 3 &&
    competingCluster.values.length / dominantCluster.values.length >= 0.4;

  return {
    x: average(dominantCluster.values),
    conflicting,
  };
}

export function resolvePageSupportedCoordinateEvidence(
  observations: readonly PageCoordinateObservation[],
  coordinateTolerance: number,
): CoordinateEvidence {
  const clusters = clusterPageCoordinates(
    observations,
    coordinateTolerance,
  ).sort(
    (left, right) =>
      countPages(right) - countPages(left) ||
      right.length - left.length ||
      average(left.map((observation) => observation.x)) -
        average(right.map((observation) => observation.x)),
  );
  const dominantCluster = clusters[0];

  if (dominantCluster === undefined) {
    return { x: null, conflicting: false };
  }

  const competingCluster = clusters[1];
  const dominantX = average(
    dominantCluster.map((observation) => observation.x),
  );

  if (competingCluster === undefined) {
    return { x: dominantX, conflicting: false };
  }

  const tied =
    countPages(competingCluster) === countPages(dominantCluster) &&
    competingCluster.length === dominantCluster.length;

  if (tied) {
    return { x: null, conflicting: true };
  }

  const conflicting =
    competingCluster.length >= 3 &&
    competingCluster.length / dominantCluster.length >= 0.4;

  return { x: dominantX, conflicting };
}

export function clusterCoordinates(
  values: readonly number[],
  coordinateTolerance: number,
): readonly CoordinateCluster[] {
  const clusters: CoordinateCluster[] = [];

  for (const value of [...values].sort((left, right) => left - right)) {
    const currentCluster = clusters.at(-1);

    if (
      currentCluster === undefined ||
      value - currentCluster.values.at(-1)! > coordinateTolerance
    ) {
      clusters.push({ values: [value] });
      continue;
    }

    currentCluster.values.push(value);
  }

  return clusters;
}

function clusterPageCoordinates(
  observations: readonly PageCoordinateObservation[],
  coordinateTolerance: number,
): PageCoordinateObservation[][] {
  const clusters: PageCoordinateObservation[][] = [];

  for (const observation of [...observations].sort(
    (left, right) => left.x - right.x,
  )) {
    const currentCluster = clusters.at(-1);

    if (
      currentCluster === undefined ||
      observation.x - currentCluster.at(-1)!.x > coordinateTolerance
    ) {
      clusters.push([observation]);
      continue;
    }

    currentCluster.push(observation);
  }

  return clusters;
}

function countPages(
  observations: readonly PageCoordinateObservation[],
): number {
  return new Set(observations.map((observation) => observation.pageIndex)).size;
}

export function inferCoordinateTolerance(
  lines: readonly PhysicalTextLine[],
): number {
  if (lines.length === 0) {
    return 1;
  }

  return median(lines.map((line) => line.bounds.height)) / 4;
}

export function median(values: readonly number[]): number {
  const sortedValues = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 1) {
    return sortedValues[middleIndex]!;
  }

  return (sortedValues[middleIndex - 1]! + sortedValues[middleIndex]!) / 2;
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
