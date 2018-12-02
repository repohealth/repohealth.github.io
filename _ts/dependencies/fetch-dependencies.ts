import { FetchResponse } from "../fetch";
import { GitHubRepo } from "../github/github-repo";
import { Dependencies } from "./dependencies";
import { fetchJavaScriptDependencies } from "./fetch-javascript-dependencies";
import { noDependencies } from "./no-dependencies";

/**
 * Fetches the dependencies for the specified GitHub repo
 */
export async function fetchDependencies(repo: GitHubRepo): Promise<FetchResponse<Dependencies>> {
  try {
    let language = repo.language ? repo.language.toLowerCase() : "";

    switch (language) {
      case "javascript":
      case "typescript":
        return fetchJavaScriptDependencies(repo);

      default:
        // Not yet implemented for this language
        return noDependencies();
    }
  }
  catch (error) {
    return {
      ok: false,
      error: error as Error,
      status: 400,
      statusText: "Client Error",
      url: "",
      headers: {},
      rawBody: "",
    };
  }
}
