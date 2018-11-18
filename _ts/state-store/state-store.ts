import { GitHubAccount } from "../github/github-account";
import { GitHubRepo } from "../github/github-repo";
import { AppState, ReadonlyAppState } from "./app-state";
import { fetchData } from "./fetch-data";
import { hashMatchesState, readStateFromHash, writeStateToHash } from "./hash";

const hashchange = "hashchange";
const statechange = "statechange";

interface StateChangeEventDetail {
  state: Partial<ReadonlyAppState>;
  callback(): void;
}

export class StateStore extends EventTarget {
  public readonly state: ReadonlyAppState = new AppState();

  public constructor() {
    super();

    // Initialize the state from the URL hash
    this.syncWithHash();

    // Update the state whenever the hash changes
    window.addEventListener(hashchange, () => this.syncWithHash());
  }

  /**
   * Subscribes to the "statechange" event
   */
  public onStateChange(listener: (evt: CustomEvent<StateChangeEventDetail>) => void) {
    this.addEventListener(statechange, listener);
  }

  /**
   * Dispatches a "statechange" event
   */
  public setState(partialState: Partial<ReadonlyAppState>, callback?: () => void) {
    Object.assign(this.state, partialState);

    let stateChangeEvent = new CustomEvent<StateChangeEventDetail>(statechange, {
      detail: {
        state: this.state,
        callback: () => {
          writeStateToHash(this.state);
          callback && callback(); //tslint:disable-line:no-void-expression
        }
      }
    });

    this.dispatchEvent(stateChangeEvent);
  }

  /**
   * Updates the state to match the URL hash
   */
  public syncWithHash() {
    if (hashMatchesState(this.state)) {
      // The URL hash is already in-sync with the app state
      return;
    }

    let hashState = readStateFromHash();

    // Re-order the accounts to match the hash order
    if (hashState.accounts) {
      let hashAccounts = hashState.accounts;
      hashState.accounts = [];

      for (let hashAccount of hashAccounts) {
        let account = this.getAccount(hashAccount.login);
        if (account) {
          hashState.accounts.push(account);
        }
        else {
          // This is a newly-added account
          hashState.accounts.push(hashAccount);
          hashAccount.loading = true;

          // Fetch the account's data from GitHub, David-DM, etc.
          // NOTE: We do this asynchronously, so this function can return immediately
          fetchData(hashAccount, (updated) => this.updateAccount(updated))
            .catch((error) => {
              // Unable to fetch the account's data
              hashAccount.error = (error as Error).message;
              this.updateAccount(hashAccount);
            });
        }
      }
    }

    this.setState(hashState);
  }

  /**
   * Determines whether the specified account already exists
   */
  public hasAccount(login: string | GitHubAccount): boolean {
    if (typeof login === "object") {
      login = login.login;
    }

    return Boolean(this.getAccount(login));
  }

  /**
   * Returns the account with the specified login
   */
  public getAccount(login: string) {
    return this.state.accounts.find(byLogin(login));
  }

  /**
   * Adds a new GitHub account with the specified login to the accounts list,
   * and asynchronously fetches the account info from GitHub
   */
  public async addAccount(login: string) {
    login = login.trim();

    if (this.hasAccount(login)) {
      // The account already exists
      return;
    }

    let account = new GitHubAccount({
      login,
      name: login,
      loading: true,
    });

    // Add this account
    let accounts = this.state.accounts.slice();
    accounts.push(account);
    this.setState({ accounts });

    // Fetch the account's data from GitHub, David-DM, etc.
    await fetchData(account, (updated) => this.updateAccount(updated));
  }

  /**
   * Removes the specified GitHub account from the accounts list
   */
  public updateAccount(account: GitHubAccount) {
    let accounts = this.state.accounts.slice();
    let index = accounts.findIndex(byLogin(account.login));

    if (index >= 0) {
      accounts.splice(index, 1, account);
      this.setState({ accounts });
    }
  }

  /**
   * Removes the specified GitHub account from the accounts list
   */
  public removeAccount(account: GitHubAccount) {
    let accounts = this.state.accounts.slice();
    let index = accounts.findIndex(byLogin(account.login));

    if (index >= 0) {
      accounts.splice(index, 1);
      this.setState({ accounts });
    }
  }

  /**
   * Adds or removes the specified GitHub repo from the `hiddenRepos` list
   */
  public toggleHidden(repo: GitHubRepo, hidden: boolean) {
    let hiddenRepos = new Set(this.state.hiddenRepos);
    if (hidden) {
      hiddenRepos.add(repo.full_name);
    }
    else {
      hiddenRepos.delete(repo.full_name);
    }
    this.setState({ hiddenRepos });
  }

  /**
   * Determines whether the GitHub Repo is current hidden
   */
  public isHidden(repo: GitHubRepo): boolean {
    if (this.state.hiddenRepos.has(repo.full_name)) {
      // This repo has been explicitly hidden
      return true;
    }

    if (repo.fork && !this.state.showForks) {
      // Don't show forked repos
      return true;
    }

    if (repo.archived && !this.state.showArchived) {
      // Don't show archived repos
      return true;
    }

    return false;
  }
}


/**
 * Used to find GitHub accounts by their "login" property
 */
function byLogin(login: string) {
  login = login.trim().toLowerCase();
  return (obj: { login: string }) => obj.login.trim().toLowerCase() === login;
}
