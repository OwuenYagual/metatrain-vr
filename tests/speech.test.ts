import assert from 'node:assert/strict';
import test from 'node:test';
import { INDUCTION_ACTIVITIES } from '../shared/inductionActivities';
import { CAMPUS_GUIDE_OBJECT_ID } from '../shared/campus';
import { SIMULATION_STAGE_CATALOG } from '../shared/simulation';
import {
    buildEvaluationNarrationText,
    CAMPUS_GUIDE_BUBBLE_ID,
    CAMPUS_GUIDE_DIALOGUE,
    EVALUATION_NPC_STATION_ID,
    EVALUATION_RESPONSE_INSTRUCTION,
    EVALUATION_RESPONSE_PROMPT,
    getSimulationGuideBubbleId,
    getSimulationGuideStationId,
    getNpcVoiceProfile,
    normalizeSpokenText,
    proposeVoiceAnswer,
    resolveNarration,
} from '../shared/speech';
import { TRAINING_STATIONS } from '../shared/trainingModule';
import { buildNpcSpeechBubbles } from '../src/induction/npcSpeech';
import { escapeSsml } from '../server/domain/ssml';

test('cada globo visible tiene una narración autorizada con voz ecuatoriana', () => {
    const campusGuide = resolveNarration(CAMPUS_GUIDE_OBJECT_ID, CAMPUS_GUIDE_BUBBLE_ID);
    assert.ok(campusGuide);
    assert.equal(campusGuide.zoneId, 'lobby');
    assert.equal(campusGuide.text, CAMPUS_GUIDE_DIALOGUE);
    assert.match(campusGuide.voice.voiceName, /^es-EC-(Andrea|Luis)Neural$/);

    for (const stage of SIMULATION_STAGE_CATALOG) {
        const stationId = getSimulationGuideStationId(stage.id);
        const narration = resolveNarration(stationId, getSimulationGuideBubbleId(stage.id));
        assert.ok(narration, stationId);
        assert.equal(narration.zoneId, 'simulation-lab');
        assert.equal(narration.label, stage.title);
        assert.equal(narration.text, stage.guide.introduction);
        assert.match(narration.voice.voiceName, /^es-EC-(Andrea|Luis)Neural$/);
    }

    for (const station of TRAINING_STATIONS) {
        const activity = INDUCTION_ACTIVITIES[station.id];
        assert.ok(activity);
        const profile = getNpcVoiceProfile(station.id);
        assert.ok(profile);
        assert.match(profile.voiceName, /^es-EC-(Andrea|Luis)Neural$/);

        for (const [lessonIndex] of activity.training.lessons.entries()) {
            for (const bubble of buildNpcSpeechBubbles(activity, lessonIndex)) {
                const narration = resolveNarration(station.id, bubble.id);
                assert.ok(narration, `${station.id}:${bubble.id}`);
                assert.equal(narration.zoneId, 'induction-office');
                assert.equal(narration.text, bubble.text);
                assert.equal(narration.kind, bubble.kind);
            }
        }
    }
});

test('dicta la pregunta, las opciones por letra y el cierre antes de escuchar', () => {
    const profile = getNpcVoiceProfile(EVALUATION_NPC_STATION_ID);
    assert.ok(profile);
    assert.equal(profile.guideName, 'Guía de evaluación');
    assert.match(profile.voiceName, /^es-EC-(Andrea|Luis)Neural$/);
    assert.equal(
        buildEvaluationNarrationText({
            text: '¿Qué acción corresponde?',
            options: [
                { text: 'Reportar el incidente' },
                { text: 'Ignorar el incidente' },
                { text: 'Esperar hasta mañana' },
            ],
        }),
        `¿Qué acción corresponde? Opción A: Reportar el incidente. Opción B: Ignorar el incidente. Opción C: Esperar hasta mañana. ${EVALUATION_RESPONSE_INSTRUCTION} ${EVALUATION_RESPONSE_PROMPT}`,
    );
});

test('rechaza IDs de narración que no pertenecen al catálogo', () => {
    assert.equal(resolveNarration('obj_manual', 'contenido-inventado'), null);
    assert.equal(resolveNarration('estacion-inventada', 'confidentiality-greeting'), null);
});

test('escapa contenido antes de insertarlo en SSML', () => {
    assert.equal(
        escapeSsml('Regla <A> & "B" con\' C'),
        'Regla &lt;A&gt; &amp; &quot;B&quot; con&apos; C',
    );
});

test('normaliza acentos, puntuación y espacios de una respuesta hablada', () => {
    assert.equal(normalizeSpokenText('  ¡La OPCIÓN número DÓS!  '), 'la opcion numero dos');
});

test('selecciona opciones por número, letra o texto y exige una coincidencia clara', () => {
    const options = [
        { id: 'corporate', text: 'En las herramientas corporativas autorizadas.' },
        { id: 'personal', text: 'En mi correo personal.' },
        { id: 'public', text: 'En una carpeta pública.' },
    ];
    assert.deepEqual(
        proposeVoiceAnswer('q1', 'opción dos', options),
        { questionId: 'q1', optionId: 'personal', transcript: 'opción dos', status: 'matched' },
    );
    assert.equal(proposeVoiceAnswer('q1', 'respuesta A', options).optionId, 'corporate');
    assert.equal(proposeVoiceAnswer('q1', 'A', options).optionId, 'corporate');
    assert.equal(proposeVoiceAnswer('q1', 'B', options).optionId, 'personal');
    assert.equal(proposeVoiceAnswer('q1', 'C', options).optionId, 'public');
    assert.equal(proposeVoiceAnswer('q1', 'be', options).optionId, 'personal');
    assert.equal(proposeVoiceAnswer('q1', 'opción b', options).optionId, 'personal');
    assert.equal(proposeVoiceAnswer('q1', 'opcion c', options).optionId, 'public');
    assert.equal(
        proposeVoiceAnswer('q1', 'En las herramientas corporativas autorizadas', options).optionId,
        'corporate',
    );
    assert.deepEqual(
        proposeVoiceAnswer('q1', 'no estoy seguro', options),
        { questionId: 'q1', optionId: null, transcript: 'no estoy seguro', status: 'no-match' },
    );
});

test('no propone una opción cuando dos respuestas tienen una similitud equivalente', () => {
    const proposal = proposeVoiceAnswer('q2', 'usar canal interno autorizado', [
        { id: 'one', text: 'Usar canal interno soporte autorizado' },
        { id: 'two', text: 'Usar canal interno seguridad autorizado' },
    ]);
    assert.equal(proposal.status, 'ambiguous');
    assert.equal(proposal.optionId, null);
});
