export interface SourceReplayEntry {
  key: string;
  body: string;
  source?: string;
  disagreementClass?: string;
  rawResponseFile?: string;
  normalizedCandidateFile?: string;
}

export interface FixtureRegistrySummary {
  entries: number;
  disagreementClasses: string[];
  sources: string[];
}

export class SourceReplayRegistry {
  private readonly entries: Map<string, SourceReplayEntry>;

  public constructor(entries: SourceReplayEntry[]) {
    this.entries = new Map(entries.map((entry) => [entry.key, entry]));
  }

  public resolve(key: string): SourceReplayEntry | undefined {
    return this.entries.get(key);
  }

  public toHttpMap(): Record<string, string> {
    return Object.fromEntries([...this.entries.values()].map((entry) => [entry.key, entry.body]));
  }

  public summary(): FixtureRegistrySummary {
    const sources = new Set<string>();
    const disagreementClasses = new Set<string>();
    for (const entry of this.entries.values()) {
      if (entry.source) {
        sources.add(entry.source);
      }
      if (entry.disagreementClass) {
        disagreementClasses.add(entry.disagreementClass);
      }
    }
    return {
      entries: this.entries.size,
      disagreementClasses: [...disagreementClasses].sort(),
      sources: [...sources].sort()
    };
  }
}
