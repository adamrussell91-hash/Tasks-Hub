import { getHubSession } from './_shared/session.mts';
import { getTasksStore } from './_shared/blobs.mts';
import { TaskCreateSchema, TaskUpdateSchema } from '../../src/schemas/task.ts';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  methodNotAllowed,
  misconfiguredResponse,
  okResponse,
  preflightResponse,
  withCors
} from './_shared/http.mts';

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getHubSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthenticated', 'Sign in required'), request, env);
  }

  const store = await getTasksStore();
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  try {
    if (request.method === 'GET') {
      if (id) {
        const task = await store.getTask(id);
        if (!task) return withCors(errorResponse(404, 'not_found', 'Task not found'), request, env);
        return withCors(okResponse(200, task), request, env);
      }
      const tasks = await store.listTasks();
      return withCors(okResponse(200, { tasks }), request, env);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const parsed = TaskCreateSchema.parse(body);
      const task = await store.createTask(parsed);
      return withCors(okResponse(201, task), request, env);
    }

    if (request.method === 'PATCH') {
      if (!id) return withCors(errorResponse(400, 'missing_id', 'id query param required'), request, env);
      const body = await request.json();
      const parsed = TaskUpdateSchema.parse(body);
      const task = await store.updateTask(id, parsed);
      return withCors(okResponse(200, task), request, env);
    }

    if (request.method === 'DELETE') {
      if (!id) return withCors(errorResponse(400, 'missing_id', 'id query param required'), request, env);
      let meta: { agent?: string; reason?: string } | undefined;
      try {
        const body = await request.json();
        if (body && typeof body === 'object') {
          meta = body as { agent?: string; reason?: string };
        }
      } catch {
        /* no body */
      }
      await store.deleteTask(id, meta);
      return withCors(okResponse(200, { deleted: true }), request, env);
    }

    return withCors(methodNotAllowed('GET, POST, PATCH, DELETE, OPTIONS'), request, env);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    return withCors(errorResponse(400, 'bad_request', message), request, env);
  }
}

export const config = { path: '/api/tasks' };
