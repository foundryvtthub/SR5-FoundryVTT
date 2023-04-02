import {SR5BaseActorSheet} from "./SR5BaseActorSheet";


export class SR5SpiritActorSheet extends SR5BaseActorSheet {
    /**
     * Spirit actors will handle these item types specifically.
     *
     * All others will be collected within the gear tab.
     *
     * @returns An array of item types from the template.json Item section.
     */
    getHandledItemTypes(): string[] {
        let itemTypes = super.getHandledItemTypes();

        return [
            ...itemTypes,
            'critter_power',
            'spell',
            'quality'
        ];
    }

    async getData(options: any) {
        const data = await super.getData(options);
        
        const spirit = this.document.asSpirit();
        if (spirit) {
            if (spirit.system.summonerUuid) {
                data['summoner'] = await fromUuid((this.document.system as Shadowrun.SpiritData).summonerUuid);
            }
        }

        return data;
    }
}