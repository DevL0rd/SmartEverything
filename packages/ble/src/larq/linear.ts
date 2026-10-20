const BYTES = 8;

const SINGULAR = 1e-12;

export class SingularSystemError extends Error {
  override readonly name = 'SingularSystemError';
}

class Grid {
  private readonly cells: DataView;
  readonly width: number;

  constructor(readonly size: number) {
    this.width = size + 1;
    this.cells = new DataView(new ArrayBuffer(size * this.width * BYTES));
  }

  read(row: number, column: number): number {
    return this.cells.getFloat64((row * this.width + column) * BYTES, true);
  }

  write(row: number, column: number, value: number): void {
    this.cells.setFloat64((row * this.width + column) * BYTES, value, true);
  }

  pivotOf(column: number): number {
    let best = column;
    for (let row = column + 1; row < this.size; row += 1) {
      if (Math.abs(this.read(row, column)) > Math.abs(this.read(best, column))) {
        best = row;
      }
    }
    return best;
  }

  swap(first: number, second: number): void {
    for (let column = 0; column < this.width; column += 1) {
      const held = this.read(first, column);
      this.write(first, column, this.read(second, column));
      this.write(second, column, held);
    }
  }

  clearBelow(column: number): void {
    for (let row = column + 1; row < this.size; row += 1) {
      const factor = this.read(row, column) / this.read(column, column);
      for (let k = column; k < this.width; k += 1) {
        this.write(row, k, this.read(row, k) - factor * this.read(column, k));
      }
    }
  }

  solution(): number[] {
    const found: number[] = [];
    for (let row = this.size - 1; row >= 0; row -= 1) {
      let rest = this.read(row, this.size);
      found.forEach((value, offset) => {
        rest -= this.read(row, this.size - 1 - offset) * value;
      });
      found.push(rest / this.read(row, row));
    }
    return found.reverse();
  }
}

export function solveLinear(augmented: readonly (readonly number[])[]): number[] {
  const grid = new Grid(augmented.length);
  augmented.forEach((line, row) => {
    line.forEach((value, column) => {
      grid.write(row, column, value);
    });
  });
  for (let column = 0; column < grid.size; column += 1) {
    const pivot = grid.pivotOf(column);
    if (Math.abs(grid.read(pivot, column)) < SINGULAR) {
      throw new SingularSystemError(`Column ${String(column)} has no usable pivot.`);
    }
    grid.swap(column, pivot);
    grid.clearBelow(column);
  }
  return grid.solution();
}
