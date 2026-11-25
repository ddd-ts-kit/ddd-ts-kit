import { Unreachable } from './unreachable';

interface HeldCall {
  readonly answer: (value: string) => void;
  readonly fail: (error: unknown) => void;
}

/** A fake adapter whose calls end when the test says so, and how: by their rank, the first is 0. */
export class HeldGateway {
  private readonly held: HeldCall[] = [];

  async call(): Promise<string> {
    return new Promise<string>((answer, fail) => this.held.push({ answer, fail }));
  }

  answer(rank: number): void {
    this.held[rank]?.answer('answered');
  }

  fail(rank: number): void {
    this.held[rank]?.fail(new Unreachable());
  }
}
