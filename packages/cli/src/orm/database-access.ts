/** The database an ORM opens for a generated project, and how the code of the project reaches it. */
export interface DatabaseAccess {
  /**
   * What a repository adapter names in its dependency list to reach the storage: `Database`, a
   * class of the platform, or the context class of the package of the ORM.
   */
  readonly token: string;
  /** The package that exports the token; absent when the platform declares it. */
  readonly tokenPackage?: string;
  /** Whether opening the persistence answers a promise, which a composition root awaits. */
  readonly opensWithPromise: boolean;
}
