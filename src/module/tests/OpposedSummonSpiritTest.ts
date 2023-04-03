import { SR5 } from '../config';
import { DataDefaults } from '../data/DataDefaults';
import { PartsList } from '../parts/PartsList';
import { ConjuringRules } from '../rules/ConjuringRules';
import { DrainTest } from './DrainTest';
import { OpposedTest, OpposedTestData } from './OpposedTest';
import { TestDocuments, TestOptions } from './SuccessTest';
import { SummonSpiritTest } from './SummonSpiritTest';
import { TestCreator } from './TestCreator';


interface OpposedSummonSpiritTestData extends OpposedTestData {
    // The created spirit actors FoundryVTT uuid
    summonedSpiritUuid: null | string
}

/**
 * The opposed test of summoning a spirit.
 * 
 * The summoner is the active actor and the spirit is the opposed actor.
 */
export class OpposedSummonSpiritTest extends OpposedTest {
    data: OpposedSummonSpiritTestData
    public against: SummonSpiritTest

    constructor(data, documents?: TestDocuments, options?: TestOptions) {
        // Due to summoning, the active actor for this test will be created during execution.
        // The selected or user character aren't the correct choice here.
        delete documents?.actor;
        delete data.sourceActorUuid;

        super(data, documents, options);       

        this._assertCorrectAgainst();
    }

    /**
     * Prohibit opposing any other test than SummonSpiritTest
     */
    _assertCorrectAgainst() {
        if (this.against.type !== 'SummonSpiritTest') throw new Error(`${this.constructor.name} can only oppose SummonSpiritTest but is opposing a ${this.against.type}`);
    }

    _prepareData(data: any, options?: any) {
        data = super._prepareData(data, options);

        data.summonedSpiritUuid = data.summonedSpiritUuid || null;
        data.services = data.services || 0;

        return data;
    }

    get _chatMessageTemplate(): string {
        return 'systems/shadowrun5e/dist/templates/rolls/opposed-actor-creator-message.html'
    }

    /**
     * The order of summoning a spirit goes:
     * - Summoning it
     * - it resisting your summoning
     * - the summoner resists the drain based on the spirits results
     */
    _prepareFollowupActionsTemplateData() {
        const actions: Shadowrun.FollowupAction[] = [];

        const testCls = TestCreator._getTestClass(this.against.data.action.followed.test);
        if (!testCls) return actions;

        actions.push({label: testCls.label});
        return actions;
    }

    /**
     * When summoning the opposing spirit test triggers the DrainTest from summoning.
     * Since we can expect this test be within the GM context, we can't auto cast DrainTest.
     */
    get autoExecuteFollowupTest() {
        return false;
    }

    /**
     * Calculate drain and execute the actives test followup (should be drain test)
     */
    async executeFollowUpTest() {
        this.against.calcDrain(this.hits.value);
        await this.against.saveToMessage();
        this.against.executeFollowUpTest();
    }

    /**
     * To have an opposing actor, that's not on the map already, create the spirit actor.
     */
    async populateDocuments() {
        await this.createSummonedSpirit();
        if (!this.data.summonedSpiritUuid) return;

        this.data.sourceActorUuid = this.data.summonedSpiritUuid;

        await super.populateDocuments();
    }

    /**
     * Other than force there shouldn't be any other pool parts.
     */
    applyPoolModifiers() {
        // NOTE: We don't have an actor, therefore don't need to call document modifiers.
        PartsList.AddUniquePart(this.data.pool.mod, 'SR5.Force', this.against.data.force);
    }

    /**
     * A failure for the spirit is a success for the summoner.
     */
    async processFailure() {
        await this.finalizeSummonedSpirit();
        
        // Finalize the original test values.
        this.against.calcDrain(this.hits.value);
        await this.against.saveToMessage();
    }

    /**
     * A success of the spirit is a failure for the summoner.
     */
    async processSuccess() {
        await this._cleanupAfterExecutionCancel();
    }

    get successLabel(): string {
        return 'SR5.TestResults.SpiritSummonFailure';
    }

    get failureLabel(): string {
        return 'SR5.TestResults.SpiritSummonSuccess';
    }

    /**
     * Derive the amount of services the created actor spirit will have.
     * 
     * Should be called after a successful summoning.
     */
    deriveSpiritServices() {
        return ConjuringRules.spiritServices(this.against.hits.value, this.hits.value);
    }

    /**
     * Finalize the existing spirit actor with context around it's summoning.
     * 
     * This should be called as the last step in summoning.
     */
    async finalizeSummonedSpirit() {
        if (!this.actor) return;

        const summoner = this.against.actor as Actor;        

        const updateData = {
            'system.services': this.deriveSpiritServices(),
            'system.summonerUuid': summoner.uuid
        }

        this._addOwnershipToUpdateData(updateData);

        await this.actor.update(updateData);
    }

    /**
     * Give all users with the summoning actor permissions of the created spirit actor.
     * 
     * @param updateData The update data to add the permission to, that's applied to the spirit actor. 
     */
    _addOwnershipToUpdateData(updateData: object) {
        const summoner = this.against.actor as Actor;

        // Set permissions for all users using the summoner as main character.
        const users = game.users?.filter(user => user.character?.uuid === summoner.uuid);
        if (!users) return;

        const ownership = {};
        users.forEach(user => {
            if (user.isGM) return;
            // #TODO: Add a setting to define that this should be done and what permission it should be done with.
            ownership[user.id] = CONST.DOCUMENT_PERMISSION_LEVELS.OWNER;
        })
        updateData['ownership'] = ownership
    }

    /**
     * Based on this tests selection, create a spirit actor
     */
    async createSummonedSpirit() {
        if (!this.against) return;
        if (!this.against.actor) return;

        const summoner = this.against.actor;

        const spiritType = this.against.data.spiritTypeSelected;

        const name = `${summoner.name} ${game.i18n.localize(SR5.spiritTypes[spiritType])} ${game.i18n.localize('ACTOR.TypeSpirit')}`;
        const force = this.against.data.force;
        const system = { force, spiritType };

        const actor = await Actor.create({ name, type: 'spirit', system, prototypeToken: {actorLink: true} });

        if (!actor) return console.error('Shadowrun 5e | Could not create the summoned spirit actor');

        this.data.summonedSpiritUuid = actor.uuid;
    }

    /**
     * Cleanup created actors that aren't needed anymore.
     * 
     * When user cancels the dialog, the spirits has been created. Remove it.
     */
    async _cleanupAfterExecutionCancel() {
        if (!this.data.summonedSpiritUuid) return;
        const actor = await fromUuid(this.data.summonedSpiritUuid);
        await actor?.delete();
        delete this.actor;
    }
}
