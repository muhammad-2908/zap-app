import { isValidObjectId } from 'mongoose';
import { encryptSecret } from '../../lib/crypto.js';
import type { GitHubUser } from '../../lib/github-client.js';
import { UserModel, type UserDoc } from '../../models/user.model.js';

/** What the API is allowed to expose about a user. Never includes the token. */
export interface PublicUser {
  id: string;
  githubId: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  tokenStatus: 'valid' | 'revoked';
}

function toPublicUser(doc: UserDoc): PublicUser {
  return {
    id: doc._id.toString(),
    githubId: doc.githubId,
    login: doc.login,
    name: doc.name ?? null,
    avatarUrl: doc.avatarUrl ?? null,
    tokenStatus: doc.tokenStatus as PublicUser['tokenStatus'],
  };
}

/** Creates the user on first sign-in, refreshes profile and token on later ones. Keyed by GitHub id. */
export async function upsertGithubUser(gh: GitHubUser, accessToken: string, scopes: string[]): Promise<PublicUser> {
  const doc = await UserModel.findOneAndUpdate(
    { githubId: gh.id },
    {
      $set: {
        login: gh.login,
        name: gh.name,
        avatarUrl: gh.avatar_url,
        email: gh.email,
        accessTokenEnc: encryptSecret(accessToken),
        tokenScopes: scopes,
        tokenStatus: 'valid',
        lastLoginAt: new Date(),
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true },
  ).lean<UserDoc>();
  if (!doc) throw new Error('User upsert returned nothing');
  return toPublicUser(doc);
}

export async function findUserById(id: string): Promise<PublicUser | null> {
  if (!isValidObjectId(id)) return null;
  const doc = await UserModel.findById(id).lean<UserDoc>();
  return doc ? toPublicUser(doc) : null;
}
