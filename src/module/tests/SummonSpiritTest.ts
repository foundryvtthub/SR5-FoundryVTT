import { SR5 } from './../config';
import { DataDefaults } from "../data/DataDefaults";
import { SuccessTest, SuccessTestData } from "./SuccessTest";
import { PartsList } from '../parts/PartsList';
import { SpellcastingRules } from '../rules/SpellcastingRules';
import { DrainRules } from '../rules/DrainRules';
import { ConjuringRules } from '../rules/ConjuringRules';


interface SummonSpiritTestData extends SuccessTestData {
    spiritTypes: typeof SR5.spiritTypes
    spiritTypeSelected: string

    force: number
    drain: number

    drainDamage: Shadowrun.DamageData
}

/**
 * Summoning a spirit is described in SR5#300.
 * 
 * NOTE: While we need spell casting data, we don't need general spell casting flow.
 *       This is due to spell casting operating on spell items, while summoning is an action item.
 * 
 * #TODO: How to implement reagents
 * 
 */
export class SummonSpiritTest extends SuccessTest {
    override data: SummonSpiritTestData

    override _prepareData(data: any, options: any) {
        data = super._prepareData(data, options);

        // #TODO: Preselect the first spirit type instead of empty.
        data.spiritTypes = this._prepareSpiritTypes();
        data.spiritTypeSelected = data.spiritTypeSelected || 0;

        data.force = data.force || 1;
        // #TODO: Check for drain?
        data.drain = data.drain || 0;
        data.drainDamage = data.drainDamage || DataDefaults.damageData();

        return data;
    }

    override get _dialogTemplate() {
        return 'systems/shadowrun5e/dist/templates/apps/dialogs/summonspirit-test-dialog.html';
    }

    /**
     * A summoning test can't be extended.
     */
    override get canBeExtended() {
        return false;
    }

    /**
     * Drain test is configured here but will be executed within the opposing tests context.
     */
    override get autoExecuteFollowupTest() {
        return false;
    }

    /**
     * Skill + Attribute [Limit] as defined in SR5#300 'Attempt summoning'
     * 
     * Limit 'force' is a dynamic test value, so it's missing here as it can't be taken from actor values.
     */
    static override _getDefaultTestAction(): Partial<Shadowrun.MinimalActionData> {
        return {
            skill: 'summoning',
            attribute: 'magic'
        }
    }

    /**
     * Summoning uses Force as limit, which needs to be injected into the normal test flow.
     */
    override prepareBaseValues() {
        super.prepareBaseValues();
        this.prepareLimitValue();
    }

    /**
     * Calculate limit based on force selected by user.
     */
    prepareLimitValue() {
        const force = Number(this.data.force);
        this.data.limit.mod = PartsList.AddUniquePart(
            this.data.limit.mod,
            'SR5.Force',
            SpellcastingRules.calculateLimit(force));
    }

    /**
     * TODO: Reduce all spirit types to those available to the Summoner according to tradition.
     * @returns A subset of all spirit types
     */
    _prepareSpiritTypes() {
        return SR5.spriteTypes;
    }

    /**
     * Derive the actual drain damage from spellcasting values.
     * 
     * NOTE: This will be called by the opposing test via a follow up test action.
     */
    calcDrain(opposingHits: number) {
        this.data.drain = ConjuringRules.summoningDrainValue(opposingHits);
        this.calcDrainDamage(opposingHits);
    }

    calcDrainDamage(opposingHits: number) {
        if (!this.actor) return DataDefaults.damageData();

        const magic = this.actor.getAttribute('magic').value;
        const force = this.data.force;
        this.data.drainDamage = ConjuringRules.calcDrainDamage(opposingHits, force, magic);
    }
}