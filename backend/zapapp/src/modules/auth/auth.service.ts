import { exchangeCodeForToken, getAuthenticatedUser } from '../../lib/github-client.js';
import { signSession } from '../../lib/session.js';
import { upsertGithubUser, type PublicUser } from '../users/users.service.js';

/** OAuth code -> GitHub token -> GitHub profile -> our user -> signed session token. */
export async function completeGithubLogin(code: string): Promise<{ user: PublicUser; sessionToken: string }> {
  const { accessToken, scopes } = await exchangeCodeForToken(code);
  const ghUser = await getAuthenticatedUser(accessToken);
  const user = await upsertGithubUser(ghUser, accessToken, scopes);
  const sessionToken = await signSession(user.id);
  return { user, sessionToken };
}
