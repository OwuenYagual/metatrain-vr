import { expect, test, type Page, type Route } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

const participantId = 'participant-e2e';
const moduleId = 'induccion_001';

type AvatarId = 'avatar_01' | 'avatar_02' | 'avatar_03';

type MockOptions = {
    avatarId?: AvatarId | null;
    completedContents?: string[];
    simulationCompleted?: boolean;
    status?: 'not_started' | 'in_progress' | 'approved' | 'failed';
    lastLocation?: {
        zoneId: 'lobby' | 'induction-office' | 'simulation-lab' | 'assessment-room';
        spawnId: string;
    };
    locationDelaysMs?: number[];
    evaluationResults?: Array<'failed' | 'approved'>;
};

const contents = [
    ['content-manual', 'obj_manual', 'Políticas y convivencia'],
    ['content-rrhh', 'obj_rrhh', 'Departamentos y personas'],
    ['content-functions', 'obj_funciones', 'Funciones de tu puesto'],
    ['content-security', 'obj_seguridad', 'Red de apoyo'],
].map(([id, interactionObjectId, title], order) => ({
    _id: id,
    moduleId,
    title,
    body: `Contenido de prueba para ${title}.`,
    order: order + 1,
    active: true,
    interactionObjectId,
}));

const evaluationQuestions = [
    {
        id: 'question-safety',
        text: '¿Qué debes hacer ante una condición insegura?',
        options: [
            { id: 'safety-ignore', text: 'Ignorarla y continuar' },
            { id: 'safety-report', text: 'Reportarla por el canal establecido' },
        ],
    },
    {
        id: 'question-support',
        text: '¿A quién debes acudir si necesitas apoyo?',
        options: [
            { id: 'support-none', text: 'Resolverlo sin informar a nadie' },
            { id: 'support-guide', text: 'A tu supervisor o persona guía' },
        ],
    },
];

test.beforeEach(async ({ page }) => {
    page.on('pageerror', (error) => console.error('Error de página E2E:', error));
    page.on('console', (message) => {
        if (message.type() === 'error') console.error('Consola E2E:', message.text());
    });
});

function createParticipant(avatarId: AvatarId | null) {
    return {
        id: participantId,
        fullName: 'Participante E2E',
        email: 'e2e@metatrain.test',
        avatarId,
        role: 'participant' as const,
        createdAt: '2026-07-22T12:00:00.000Z',
    };
}

function createEvaluationResult(status: 'failed' | 'approved', attempt: number) {
    return {
        id: `evaluation-result-${attempt}`,
        moduleId,
        totalQuestions: evaluationQuestions.length,
        correctAnswers: status === 'approved' ? evaluationQuestions.length : 1,
        score: status === 'approved' ? 100 : 50,
        status,
        createdAt: `2026-07-22T12:0${attempt}:00.000Z`,
    };
}

function createCertificate() {
    return {
        certificateId: 'META-E2E-2026-0001',
        moduleId,
        moduleTitle: 'Inducción Corporativa',
        score: 100,
        status: 'generated' as const,
        issuedAt: '2026-07-22T12:10:00.000Z',
    };
}

function createProgress(options: MockOptions = {}) {
    return {
        participantId,
        moduleId,
        moduleVersion: 1,
        worldVersion: 1,
        lastLocation: {
            worldId: 'corporate-campus',
            worldVersion: 1,
            zoneId: options.lastLocation?.zoneId ?? 'lobby',
            spawnId: options.lastLocation?.spawnId ?? 'lobby-entry',
        },
        completedContents: options.completedContents ?? [],
        simulationDecisionCount: options.simulationCompleted ? 5 : 0,
        completedSimulationDecisionIds: options.simulationCompleted
            ? ['arrival', 'security', 'team', 'customer', 'closing']
            : [],
        simulationCompleted: options.simulationCompleted ?? false,
        score: options.status === 'approved' ? 90 : null,
        status: options.status ?? 'not_started',
        durationSeconds: 120,
        lastSavedAt: '2026-07-22T12:02:00.000Z',
    };
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
    await route.fulfill({
        status,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(body),
        headers: {
            'Access-Control-Allow-Origin': '*',
        },
    });
}

async function mockApi(page: Page, options: MockOptions = {}) {
    let avatarId = options.avatarId ?? null;
    let selectedAvatarId: AvatarId | null = null;
    const progress = createProgress(options);
    const evaluationResults = options.evaluationResults ?? [];
    let evaluationSubmissionCount = 0;
    let latestEvaluationResult: ReturnType<typeof createEvaluationResult> | null = null;
    let certificate: ReturnType<typeof createCertificate> | null = null;
    let certificateIssueCount = 0;
    let certificateDownloadCount = 0;
    let progressReadCount = 0;
    let locationRequestCount = 0;
    let rejectLocationRequests = false;

    await page.route('http://localhost:3000/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const { pathname } = url;

        if (request.method() === 'OPTIONS') {
            await route.fulfill({
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, OPTIONS',
                },
            });
            return;
        }

        if (pathname.endsWith('/api/auth/login') && request.method() === 'POST') {
            await fulfillJson(route, {
                token: 'e2e-token',
                participant: createParticipant(avatarId),
                expiresAt: '2099-12-31T23:59:59.000Z',
            });
            return;
        }

        if (pathname.endsWith('/api/avatars') && request.method() === 'GET') {
            await fulfillJson(route, [
                { id: 'avatar_01', label: 'Avatar corporativo A', modelUrl: '/models/avatars/avatar_01.glb' },
                { id: 'avatar_02', label: 'Avatar corporativo B', modelUrl: '/models/avatars/avatar_02.glb' },
                { id: 'avatar_03', label: 'Avatar corporativo C', modelUrl: '/models/avatars/avatar_03.glb' },
            ]);
            return;
        }

        if (pathname.endsWith(`/api/participants/${participantId}/avatar`) && request.method() === 'PATCH') {
            const payload = request.postDataJSON() as { avatarId: AvatarId };
            selectedAvatarId = payload.avatarId;
            avatarId = payload.avatarId;
            await fulfillJson(route, { participant: createParticipant(avatarId) });
            return;
        }

        if (pathname.includes(`/api/progress/${participantId}`) && request.method() === 'GET') {
            progressReadCount += 1;
            await fulfillJson(route, progress);
            return;
        }

        if (pathname.endsWith(`/api/training/${moduleId}/contents`) && request.method() === 'GET') {
            await fulfillJson(route, contents);
            return;
        }

        if (pathname.endsWith('/api/progress/location') && request.method() === 'PUT') {
            if (rejectLocationRequests) {
                await route.abort('internetdisconnected');
                return;
            }
            locationRequestCount += 1;
            const delayMs = options.locationDelaysMs?.[locationRequestCount - 1] ?? 0;
            if (delayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
            const payload = request.postDataJSON() as { zoneId?: string; spawnId?: string };
            if (payload.zoneId && payload.spawnId) {
                progress.lastLocation.zoneId = payload.zoneId as typeof progress.lastLocation.zoneId;
                progress.lastLocation.spawnId = payload.spawnId;
            }
            await fulfillJson(route, { progress });
            return;
        }

        if (pathname.endsWith('/api/progress/interaction') && request.method() === 'POST') {
            await fulfillJson(route, { progress });
            return;
        }

        if (pathname.endsWith(`/api/evaluation/${moduleId}/questions`) && request.method() === 'GET') {
            await fulfillJson(route, { passingScore: 70, questions: evaluationQuestions });
            return;
        }

        if (pathname.endsWith(`/api/evaluation/${moduleId}/result`) && request.method() === 'GET') {
            if (!latestEvaluationResult) {
                await fulfillJson(route, { error: 'Todavía no existe una evaluación.' }, 404);
                return;
            }
            await fulfillJson(route, { result: latestEvaluationResult });
            return;
        }

        if (pathname.endsWith(`/api/evaluation/${moduleId}/submit`) && request.method() === 'POST') {
            const nextStatus = evaluationResults[evaluationSubmissionCount] ?? 'approved';
            evaluationSubmissionCount += 1;
            latestEvaluationResult = createEvaluationResult(nextStatus, evaluationSubmissionCount);
            if (nextStatus === 'approved') {
                progress.status = 'approved';
                progress.score = latestEvaluationResult.score;
            }
            await fulfillJson(route, { result: latestEvaluationResult }, 201);
            return;
        }

        if (pathname.endsWith(`/api/certificates/${moduleId}/issue`) && request.method() === 'POST') {
            certificateIssueCount += 1;
            certificate = createCertificate();
            await fulfillJson(route, { certificate }, 201);
            return;
        }

        if (pathname.endsWith(`/api/certificates/${moduleId}/download`) && request.method() === 'GET') {
            certificateDownloadCount += 1;
            await route.fulfill({
                status: 200,
                contentType: 'application/pdf',
                body: '%PDF-1.4\n% MetaTrain E2E\n%%EOF',
                headers: { 'Access-Control-Allow-Origin': '*' },
            });
            return;
        }

        if (pathname.endsWith(`/api/certificates/${moduleId}`) && request.method() === 'GET') {
            if (!certificate) {
                await fulfillJson(route, { error: 'Todavía no existe un certificado.' }, 404);
                return;
            }
            await fulfillJson(route, { certificate });
            return;
        }

        await fulfillJson(route, { error: `Solicitud E2E no simulada: ${request.method()} ${pathname}` }, 501);
    });

    return {
        getSelectedAvatarId: () => selectedAvatarId,
        getProgressReadCount: () => progressReadCount,
        getLocationRequestCount: () => locationRequestCount,
        getLastLocation: () => ({ ...progress.lastLocation }),
        getEvaluationSubmissionCount: () => evaluationSubmissionCount,
        getCertificateIssueCount: () => certificateIssueCount,
        getCertificateDownloadCount: () => certificateDownloadCount,
        setRejectLocationRequests: (reject: boolean) => {
            rejectLocationRequests = reject;
        },
    };
}

async function installSession(page: Page, avatarId: AvatarId): Promise<void> {
    await page.addInitScript(({ id, avatar }) => {
        window.sessionStorage.setItem('metatrain.authSession', JSON.stringify({
            token: 'e2e-token',
            participant: {
                id,
                fullName: 'Participante E2E',
                email: 'e2e@metatrain.test',
                avatarId: avatar,
                role: 'participant',
                createdAt: '2026-07-22T12:00:00.000Z',
            },
            expiresAt: '2099-12-31T23:59:59.000Z',
        }));
    }, { id: participantId, avatar: avatarId });
}

async function expectNoSeriousAccessibilityViolations(page: Page): Promise<void> {
    const results = await new AxeBuilder({ page }).analyze();
    const blockingViolations = results.violations
        .filter(({ impact }) => impact === 'critical' || impact === 'serious')
        .map(({ id, impact, help, nodes }) => ({
            id,
            impact,
            help,
            targets: nodes.map(({ target }) => target),
        }));

    expect(
        blockingViolations,
        `Violaciones críticas o serias de accesibilidad:\n${JSON.stringify(blockingViolations, null, 2)}`,
    ).toEqual([]);
}

async function approachAssessmentTerminal(page: Page): Promise<void> {
    const evaluationPrompt = page.getByRole('button', {
        name: /Interactuar con Evaluaci.n final/i,
    });
    const certificatePrompt = page.getByRole('button', {
        name: /Certificado bloqueado/i,
    });
    const canvas = page.locator('[aria-label="Campus 3D: assessment-room"] canvas').first();

    await expect(canvas).toBeVisible();
    await canvas.focus();
    await page.keyboard.down('Shift');
    try {
        await page.keyboard.down('w');
        try {
            await expect(evaluationPrompt.or(certificatePrompt)).toBeVisible({ timeout: 10_000 });
        } finally {
            await page.keyboard.up('w');
        }

        if (!await evaluationPrompt.isVisible()) {
            await page.keyboard.down('a');
            try {
                await expect(evaluationPrompt).toBeVisible({ timeout: 5_000 });
            } finally {
                await page.keyboard.up('a');
            }
        }
    } finally {
        await page.keyboard.up('Shift');
    }
}

test('inicia sesión, selecciona un avatar y entra al campus', async ({ page }) => {
    const api = await mockApi(page, { avatarId: null });

    await page.goto('/login');
    await page.getByLabel(/Correo/i).fill('e2e@metatrain.test');
    await page.getByLabel(/Contrase/i).fill('segura-e2e');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page).toHaveURL(/\/avatar-selector$/);
    await expect(page.getByRole('heading', { name: /Selecciona tu avatar 3D/i })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: /Avatares disponibles/i })).toBeVisible();

    const avatar = page.getByRole('radio', { name: 'Avatar corporativo B' });
    await avatar.click();
    await expect(avatar).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: /Confirmar y entrar/i }).click();

    await expect(page).toHaveURL(/\/campus\/lobby$/);
    await expect(page.getByRole('region', { name: /Estado del campus/i })).toBeVisible();
    expect(api.getSelectedAvatarId()).toBe('avatar_02');
});

test('redirige una zona bloqueada a la última ubicación permitida', async ({ page }) => {
    await installSession(page, 'avatar_01');
    await mockApi(page, {
        avatarId: 'avatar_01',
        completedContents: [],
        simulationCompleted: false,
    });

    await page.goto('/campus/simulation-lab');

    await expect(page).toHaveURL(/\/campus\/lobby$/);
    const hud = page.getByRole('region', { name: /Estado del campus/i });
    await expect(hud.getByRole('heading', { level: 1 })).toContainText(/corporativo/i);
    await expect(page.getByRole('list', { name: /Etapas del campus/i })
        .getByText(/Laboratorio de simulaci/i)).toBeVisible();
});

test('entra al laboratorio desde la puerta central del vestíbulo', async ({ page }) => {
    await installSession(page, 'avatar_01');
    await mockApi(page, {
        avatarId: 'avatar_01',
        completedContents: contents.map((content) => content._id),
        lastLocation: { zoneId: 'lobby', spawnId: 'from-simulation' },
    });
    await page.goto('/campus/lobby');

    const canvas = page.locator('[aria-label="Campus 3D: lobby"] canvas');
    const laboratoryPrompt = page.getByRole('button', {
        name: /Interactuar con Laboratorio de simulaci/i,
    });
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(1_200);
    await canvas.focus();
    await page.keyboard.down('Shift');
    try {
        await page.keyboard.down('s');
        await page.waitForTimeout(1_000);
        await page.keyboard.up('s');
    } finally {
        await page.keyboard.up('s');
        await page.keyboard.up('Shift');
    }
    if (!await laboratoryPrompt.isVisible()) {
        await page.keyboard.down('Shift');
        await page.keyboard.down('s');
        await page.waitForTimeout(1_000);
        await page.keyboard.up('s');
        await page.keyboard.up('Shift');
    }
    if (!await laboratoryPrompt.isVisible()) {
        await page.keyboard.press('s');
    }
    await expect(laboratoryPrompt).toBeVisible();

    await laboratoryPrompt.click();

    await expect(page).toHaveURL(/\/campus\/simulation-lab$/);
    await expect(page.locator('[aria-label="Campus 3D: simulation-lab"] canvas')).toBeVisible();
    await page.waitForTimeout(1_200);
    await expect(page).toHaveURL(/\/campus\/simulation-lab$/);
});

test('mantiene desarmado el portal inverso al aparecer en el laboratorio', async ({ page }) => {
    await installSession(page, 'avatar_01');
    await mockApi(page, {
        avatarId: 'avatar_01',
        completedContents: contents.map((content) => content._id),
        lastLocation: { zoneId: 'lobby', spawnId: 'from-induction' },
    });

    await page.goto('/campus/simulation-lab');

    await expect(page).toHaveURL(/\/campus\/simulation-lab$/);
    const canvas = page.locator('[aria-label="Campus 3D: simulation-lab"] canvas');
    await expect(canvas).toBeVisible();
    await canvas.focus();
    await page.waitForTimeout(1_200);
    const inversePortalPrompt = page.getByRole('button', {
        name: /Interactuar con Volver al vestíbulo/i,
    });
    await expect(inversePortalPrompt).toHaveCount(0);
    await page.keyboard.press('e');
    await page.keyboard.press('e');
    await expect(page).toHaveURL(/\/campus\/simulation-lab$/);
    await expect(inversePortalPrompt).toHaveCount(0);
});

test('reenfoca el canvas al cambiar de zona en tercera persona', async ({ page }) => {
    await installSession(page, 'avatar_03');
    await mockApi(page, { avatarId: 'avatar_03' });
    await page.goto('/campus/lobby');

    const helpButton = page.getByRole('button', { name: /Mostrar ayuda de controles/i });
    await helpButton.focus();
    await expect(helpButton).toBeFocused();

    await page.evaluate(() => {
        window.history.pushState(window.history.state, '', '/campus/induction-office');
        window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    });

    await expect(page).toHaveURL(/\/campus\/induction-office$/);
    const canvas = page.locator('[aria-label="Campus 3D: induction-office"] canvas');
    await expect(canvas).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('CANVAS');
    await expect(canvas).toHaveAttribute('role', 'application');
    await expect(canvas).toHaveAttribute('aria-label', /Centro de inducción/i);

    await page.keyboard.down('w');
    try {
        await expect(page.getByRole('button', {
            name: /Estaci.n de inducci.n 2 bloqueado/i,
        })).toBeVisible({ timeout: 8_000 });
    } finally {
        await page.keyboard.up('w');
    }
    await expect(page.getByRole('button', {
        name: /Cambiar a c.mara en primera persona/i,
    })).toBeVisible();
});

test('guarda las transiciones de zona en el mismo orden en que ocurren', async ({ page }) => {
    await installSession(page, 'avatar_01');
    const api = await mockApi(page, {
        avatarId: 'avatar_01',
        locationDelaysMs: [600, 0],
    });
    await page.goto('/campus/lobby');
    await expect(page.getByRole('region', { name: /Estado del campus/i })).toBeVisible();
    await expect.poll(api.getLocationRequestCount).toBe(1);

    await page.evaluate(() => {
        window.history.pushState(window.history.state, '', '/campus/induction-office');
        window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    });

    await expect(page).toHaveURL(/\/campus\/induction-office$/);
    await expect.poll(api.getLocationRequestCount).toBe(2);
    await expect.poll(() => api.getLastLocation().zoneId).toBe('induction-office');
    expect(api.getLastLocation().spawnId).toBe('office-entry');
});

test('permite girar la cámara de tercera persona dentro del centro de inducción', async ({ page }) => {
    await installSession(page, 'avatar_02');
    await mockApi(page, {
        avatarId: 'avatar_02',
        lastLocation: { zoneId: 'induction-office', spawnId: 'office-entry' },
    });
    await page.goto('/campus/induction-office');

    const canvas = page.locator('[aria-label="Campus 3D: induction-office"] canvas');
    await expect(canvas).toBeVisible();
    await expect(page.locator('.campus-npc-label').first()).toBeVisible();
    await page.evaluate(() => {
        const campusCanvas = document.querySelector('canvas');
        if (!campusCanvas) throw new Error('No existe el canvas del campus.');
        campusCanvas.addEventListener('campus-camera-orbit-change', (event) => {
            const orbit = (event as CustomEvent<{ yaw: number }>).detail;
            document.documentElement.dataset.cameraOrbitYaw = String(orbit.yaw);
        }, { once: true });
    });
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('El canvas del campus no tiene dimensiones visibles.');

    await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.55);
    await page.mouse.down();
    await page.mouse.move(
        bounds.x + bounds.width * 0.7,
        bounds.y + bounds.height * 0.55,
        { steps: 5 },
    );
    await page.mouse.up();

    await expect.poll(() => page.evaluate(() => (
        document.documentElement.dataset.cameraOrbitYaw ?? null
    ))).not.toBeNull();
});

test('expone un HUD operable por teclado y permite cambiar de cámara', async ({ page }) => {
    await installSession(page, 'avatar_03');
    await page.addInitScript(() => {
        Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', {
            configurable: true,
            value: () => Promise.resolve(),
        });
    });
    await mockApi(page, { avatarId: 'avatar_03' });
    await page.goto('/campus/lobby');

    const hud = page.getByRole('region', { name: /Estado del campus/i });
    await expect(hud).toBeVisible();
    await expect(page.getByRole('progressbar', { name: /Progreso de inducci/i })).toBeVisible();

    const cameraButton = page.getByRole('button', {
        name: /Cambiar a c.mara en primera persona/i,
    });
    await cameraButton.click();
    await expect(page.getByRole('button', {
        name: /Cambiar a c.mara en tercera persona/i,
    })).toBeVisible();

    const helpButton = hud.getByRole('button', { name: /Mostrar ayuda de controles/i });
    await helpButton.focus();
    await expect(helpButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: /Controles del campus/i })).toBeVisible();

    const duplicateIds = await page.locator('[id]').evaluateAll((elements) => {
        const ids = elements.map((element) => element.id).filter(Boolean);
        return ids.filter((id, index) => ids.indexOf(id) !== index);
    });
    expect(duplicateIds).toEqual([]);
});

test('no presenta violaciones críticas o serias de accesibilidad', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Iniciar sesi.n/i })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);

    await installSession(page, 'avatar_03');
    await mockApi(page, { avatarId: 'avatar_03' });
    await page.goto('/campus/lobby');
    await expect(page.getByRole('region', { name: /Estado del campus/i })).toBeVisible();
    await expect(page.locator('canvas').first()).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
});

test('muestra el diálogo sobre el NPC sin invadir el panel', async ({ page }) => {
    await installSession(page, 'avatar_01');
    await mockApi(page, {
        avatarId: 'avatar_01',
        lastLocation: { zoneId: 'induction-office', spawnId: 'office-entry' },
    });
    await page.goto('/campus/induction-office');
    await expect(page.getByRole('region', { name: /Estado del campus/i })).toBeVisible();

    await page.evaluate(async () => {
        const modulePath = '/src/store/useTrainingStore.ts';
        const { useTrainingStore } = await import(modulePath);
        const content = useTrainingStore.getState().contents.find(
            (item: { interactionObjectId: string }) => item.interactionObjectId === 'obj_manual',
        );
        if (!content) throw new Error('No se cargó el contenido de la primera estación.');
        useTrainingStore.getState().setActiveContent(content);
    });

    await expect(page.getByRole('heading', { name: /Políticas y convivencia/i })).toBeVisible();
    const worldBubble = page.locator('.campus-npc-dialogue-bubble');
    const panelBubble = page.locator('.npc-panel-dialogue-bubble');
    await expect(worldBubble).toBeVisible();
    await expect(worldBubble).toHaveAttribute('aria-label', /Bienvenida:/i);
    await expect(panelBubble).toHaveCount(0);

    const viewports = [
        { width: 375, height: 667 },
        { width: 639, height: 600 },
        { width: 768, height: 1024 },
        { width: 1000, height: 700 },
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
    ];
    for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await expect(worldBubble).toBeVisible();
        await expect.poll(() => page.evaluate(() => {
            const bubble = document.querySelector<HTMLElement>('.campus-npc-dialogue-bubble');
            const panel = document.querySelector<HTMLElement>('.induction-panel');
            if (!bubble || !panel) return false;
            const bubbleRect = bubble.getBoundingClientRect();
            const panelRect = panel.getBoundingClientRect();
            const insideViewport = bubbleRect.left >= 0
                && bubbleRect.top >= 0
                && bubbleRect.right <= window.innerWidth + 1
                && bubbleRect.bottom <= window.innerHeight + 1;
            const separatedFromPanel = window.innerWidth <= 760
                ? bubbleRect.bottom <= panelRect.top - 8
                : bubbleRect.right <= panelRect.left - 8;
            return insideViewport && separatedFromPanel;
        })).toBe(true);
    }

    await expectNoSeriousAccessibilityViolations(page);
});

test('recupera lastLocation después del login y conserva la zona al recargar', async ({ page }) => {
    const api = await mockApi(page, {
        avatarId: 'avatar_02',
        lastLocation: { zoneId: 'induction-office', spawnId: 'office-entry' },
    });

    await page.goto('/login');
    await page.getByLabel(/Correo/i).fill('e2e@metatrain.test');
    await page.getByLabel(/Contrase/i).fill('segura-e2e');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page).toHaveURL(/\/campus\/induction-office$/);
    await expect(page.getByRole('region', { name: /Estado del campus/i })
        .getByRole('heading', { level: 1 })).toContainText(/Centro de inducci/i);
    await expect.poll(api.getLocationRequestCount).toBeGreaterThan(0);
    const readsBeforeReload = api.getProgressReadCount();

    await page.reload();

    await expect(page).toHaveURL(/\/campus\/induction-office$/);
    await expect(page.getByRole('region', { name: /Estado del campus/i })).toBeVisible();
    await expect.poll(api.getProgressReadCount).toBeGreaterThan(readsBeforeReload);
});

test('aísla la cola offline por participante y reenvía solo la identidad activa', async ({ context, page }) => {
    const api = await mockApi(page);
    await page.goto('/login');
    api.setRejectLocationRequests(true);
    await context.setOffline(true);

    const queued = await page.evaluate(async () => {
        const modulePath = '/src/utils/offlineSync.ts';
        const offline = await import(modulePath);
        const payload = {
            moduleId: 'induccion_001',
            moduleVersion: 1,
            worldVersion: 1,
            zoneId: 'lobby',
            spawnId: 'lobby-entry',
            durationSeconds: 10,
        };

        offline.setOfflineSyncParticipant('offline-a');
        const resultA = await offline.sendWithOfflineFallback('/progress/location', payload, 'PUT');
        offline.setOfflineSyncParticipant('offline-b');
        const resultB = await offline.sendWithOfflineFallback('/progress/location', {
            ...payload,
            durationSeconds: 20,
        }, 'PUT');
        offline.setOfflineSyncParticipant(null);

        return {
            resultA,
            resultB,
            queueA: JSON.parse(localStorage.getItem('metatrain.pendingRequests.v2:offline-a') ?? '[]'),
            queueB: JSON.parse(localStorage.getItem('metatrain.pendingRequests.v2:offline-b') ?? '[]'),
        };
    });

    expect(queued.resultA).toBe('queued');
    expect(queued.resultB).toBe('queued');
    expect(queued.queueA).toHaveLength(1);
    expect(queued.queueB).toHaveLength(1);
    expect(queued.queueA[0].participantId).toBe('offline-a');
    expect(queued.queueB[0].participantId).toBe('offline-b');
    expect(JSON.parse(queued.queueA[0].body).clientEventId).toBe(queued.queueA[0].id);
    expect(JSON.parse(queued.queueB[0].body).clientEventId).toBe(queued.queueB[0].id);
    expect(queued.queueA[0].id).not.toBe(queued.queueB[0].id);

    await context.setOffline(false);
    api.setRejectLocationRequests(false);
    await page.evaluate(async () => {
        const modulePath = '/src/utils/offlineSync.ts';
        const offline = await import(modulePath);
        offline.setOfflineSyncParticipant('offline-a');
        await offline.syncPendingRequests();
    });

    await expect.poll(() => page.evaluate(() => (
        localStorage.getItem('metatrain.pendingRequests.v2:offline-a')
    ))).toBeNull();
    await expect.poll(api.getLocationRequestCount).toBe(1);
    const remainingQueue = await page.evaluate(() => JSON.parse(
        localStorage.getItem('metatrain.pendingRequests.v2:offline-b') ?? '[]',
    ));
    expect(remainingQueue).toHaveLength(1);
    expect(remainingQueue[0].participantId).toBe('offline-b');
});

test('permite reprobar, reintentar, aprobar y emitir el certificado PDF', async ({ page }) => {
    await installSession(page, 'avatar_01');
    const api = await mockApi(page, {
        avatarId: 'avatar_01',
        completedContents: contents.map((content) => content._id),
        simulationCompleted: true,
        status: 'in_progress',
        lastLocation: { zoneId: 'assessment-room', spawnId: 'assessment-entry' },
        evaluationResults: ['failed', 'approved'],
    });

    await page.goto('/campus/assessment-room');
    await expect(page.getByRole('region', { name: /Estado del campus/i })).toBeVisible();

    await approachAssessmentTerminal(page);

    const evaluationPrompt = page.getByRole('button', { name: /Interactuar con Evaluaci.n final/i });
    await expect(evaluationPrompt).toBeVisible();
    await evaluationPrompt.click();

    const dialog = page.getByRole('dialog', { name: /Evaluaci.n final/i });
    await expect(dialog).toBeVisible();
    const radios = dialog.getByRole('radio');
    await expect(radios).toHaveCount(4);
    await radios.nth(0).check();
    await radios.nth(2).check();
    await dialog.getByRole('button', { name: /Finalizar evaluaci/i }).click();

    await expect(dialog.getByRole('heading', { name: /intentarlo nuevamente/i })).toBeVisible();
    await expect(dialog.getByText('50%')).toBeVisible();
    await dialog.getByRole('button', { name: /Intentar nuevamente/i }).click();

    await radios.nth(1).check();
    await radios.nth(3).check();
    await dialog.getByRole('button', { name: /Finalizar evaluaci/i }).click();

    await expect(dialog.getByRole('heading', { name: /Evaluaci.n aprobada/i })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /Certificado de aprobaci/i })).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: /Emitir y descargar certificado/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('certificado-metatrain.pdf');
    await expect(dialog.getByText('META-E2E-2026-0001')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Descargar certificado nuevamente/i })).toBeVisible();
    await dialog.getByRole('button', { name: /Volver a realizar la evaluaci/i }).click();
    await expect(dialog.getByRole('radio')).toHaveCount(4);
    await expect(dialog.getByText('0 de 2 respondidas')).toBeVisible();
    expect(api.getEvaluationSubmissionCount()).toBe(2);
    expect(api.getCertificateIssueCount()).toBe(1);
    expect(api.getCertificateDownloadCount()).toBe(1);
});
