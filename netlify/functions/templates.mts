import { getHubSession } from './_shared/session.mts';
import { getTasksStore } from './_shared/blobs.mts';
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
  if (request.method !== 'GET' && request.method !== 'POST') {
    return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
  }

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getHubSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthenticated', 'Sign in required'), request, env);
  }

  const store = getTasksStore();

  try {
    if (request.method === 'GET') {
      const [frameworks, excursion_templates, task_templates, project_templates] = await Promise.all([
        store.listFrameworks(),
        store.listExcursionTemplates(),
        store.listTaskTemplates(),
        store.listProjectTemplates()
      ]);
      return withCors(
        okResponse(200, { frameworks, excursion_templates, task_templates, project_templates }),
        request,
        env
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;

    if (action === 'save_task_as_template') {
      const template = await store.saveTaskAsTemplate(String(body.task_id), String(body.name));
      return withCors(okResponse(201, template), request, env);
    }
    if (action === 'save_project_as_template') {
      const template = await store.saveProjectAsTemplate(String(body.project_id), String(body.name));
      return withCors(okResponse(201, template), request, env);
    }
    if (action === 'create_task_from_template') {
      const task = await store.createTaskFromTemplate(String(body.template_id), (body.overrides as object) ?? {});
      return withCors(okResponse(201, task), request, env);
    }
    if (action === 'create_excursion_from_template') {
      const result = await store.createExcursionFromTemplate({
        excursion_template_id: String(body.excursion_template_id),
        title: String(body.title),
        event_date: String(body.event_date),
        student_group_reference:
          body.student_group_reference === undefined || body.student_group_reference === null
            ? null
            : String(body.student_group_reference),
        description: body.description === undefined ? undefined : String(body.description)
      });
      return withCors(okResponse(201, result), request, env);
    }

    return withCors(errorResponse(400, 'unknown_action', 'Unknown templates action'), request, env);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    return withCors(errorResponse(400, 'bad_request', message), request, env);
  }
}

export const config = { path: '/api/templates' };
