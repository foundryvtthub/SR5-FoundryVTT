import { SR5 } from '../config';
import { PartsList } from '../parts/PartsList';
import { OpposedTest, OpposedTestData } from './OpposedTest';
import { TestDocuments, TestOptions } from './SuccessTest';
import { SummonSpiritTest } from './SummonSpiritTest';


interface OpposedSummonSpiritTestData extends OpposedTestData {
    // The created spirit actors FoundryVTT uuid
    summonedSpiritUuid: null | string
    services: number
}

/**
 * The opposed test of a summoned spirit.
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

    _assertCorrectAgainst() {
        if (this.against.type !== 'SummonSpiritTest') throw new Error(`${this.constructor.name} can only oppose SummonSpiritTest but is opposing a ${this.against.type}`);
    }

    _prepareData(data: any, options?: any) {
        data = super._prepareData(data, options);

        data.summonedSpiritUuid = data.summonedSpiritUuid || null;
        data.services = data.services || 0;

        return data;
    }

    async populateDocuments() {
        await this.createSummonedSpirit();
        if (!this.data.summonedSpiritUuid) return;

        this.data.sourceActorUuid = this.data.summonedSpiritUuid;

        await super.populateDocuments();
    }

    applyPoolModifiers() {
        // NOTE: We don't have an actor, therefore don't need to call document modifiers.
        PartsList.AddUniquePart(this.data.pool.mod, 'SR5.Force', this.against.data.force);
    }

    /**
     * As soon as a hit has been reached, create the spirit actor with the necessary force.
     */
    async processFailure() {
        this.deriveSpiritServices();
        await this.finalizeSummonedSpirit();
    }

    async processSuccess() {
        await this._cleanupAfterExecutionCancel();
    }

    /**
     * #TODO: Use ConjuringRules or something...
     */
    deriveSpiritServices() {
        this.data.services = Math.max(this.against.hits.value - this.hits.value, 0);
    }

    async finalizeSummonedSpirit() {
        if (!this.actor) return;

        const summoner = this.against.actor as Actor;
        

        const updateData = {
            'system.services': this.data.services,
            'system.summonerUuid': summoner.uuid
        }

        const users = game.users?.filter(user => user.character?.uuid === summoner.uuid);
        //@ts-ignore 
        if (users) {
            const ownership = {};
            users.forEach(user => {
                if (user.isGM) return;
                ownership[user.id] = CONST.DOCUMENT_PERMISSION_LEVELS.OWNER;
            })
            updateData['ownership'] = ownership
        }

        await this.actor.update(updateData);
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

        const actor = await Actor.create({ name, type: 'spirit', system });

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
