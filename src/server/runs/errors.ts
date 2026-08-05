export class NotFoundError extends Error {}

export class StaleTempoError extends Error {
  currentTempoBpm: number
  constructor(currentTempoBpm: number) {
    super('The exercise tempo is no longer current.')
    this.currentTempoBpm = currentTempoBpm
  }
}

export class InvalidSequenceError extends Error {}

export class InvalidEventError extends Error {}
