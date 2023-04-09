import { SR5Actor } from "../../actor/SR5Actor";
import { SR5Item } from "../../item/SR5Item";

/**
 * A value source allows overwriting one value with another or a function
 */
export interface ValueSources {
    [key: string]: ValueSource
}

/**
 * Provide a custom function for a single value.
 * 
 * This can be used to overwrite a value with a custom function.
 */
interface ValueSourceFunction {
    (valueKey: string, document: SR5Actor|SR5Item): any
}

type ValueSource = string | ValueSourceFunction;


/**
 * Handling of mapping values onto values.
 * 
 * This can both map local values to local values and other actor values onto a local actor values.
 */
export const ValueSourcesFlow = {
    /**
     * Provided a local value and source for it, provide a new value for it.
     * 
     * This can be used to replace an attribute or skill with a different value.
     * 
     * @param value Any local value key.
     * @param source Any ValueSource, be it local, remote or function.
     */
    getValue(value: string, source: ValueSource, document: SR5Actor|SR5Item) {
        console.debug(`Shadowrun 5e | Resolving a single value source ${source} for ${document.name} (${document.type})`);

        // Allow custom source functions to work.
        if (typeof(source) === 'function') return source(value, document);
        
        const segments = source.split('.');
        if (!segments.length) throw new Error("An empty value source couldn't be resolved");

        // Without a remote source, map to local value.
        if (!segments[0].includes('@')) return foundry.utils.getProperty(document, source);

        // Assert value as provider segment
        const providerSegment = segments.shift();
        if (!providerSegment || foundry.utils.getType(providerSegment) !== 'string') throw new Error('First source value segment is misformed');

        // Assert provider segment pointing to local path
        const providerPath = providerSegment.replace('@', '');
        const provider = foundry.utils.getProperty(document.system, providerPath);

        if (!provider) return console.error('First source value segment can not be resolved as an systemData path');

        const actor = ValueSourcesFlow._getDocumentFromProvider(provider);
        if (!actor) return console.error("Provider didn't point to an existing document", provider);

        const valuePath = ['system', ...segments].join('.');

        const sourceValue = foundry.utils.getProperty(actor, valuePath);
        return ValueSourcesFlow._injectSourceIntoValue(sourceValue, source, actor);
    },

    /**
     * Inject a small piece of data into a value to track where it came from.
     * 
     * This can be presented to the user.
     * 
     * @param value Any value within system data.
     * @param source The source key of that value.
     * @param document The document containing that value in it's system data.
     * 
     * @returns A copy of the value with the source injected.
     */
    _injectSourceIntoValue(value: any, source: string, document: SR5Actor|SR5Item): any {
        if (typeof(value) !== 'object' || Array.isArray(value)) return value;

        value = foundry.utils.duplicate(value);
        //#TODO: Add ValueData typing
        value.source = {uuid: document.uuid, source};

        return value;
    },

    /**
     * Internal helper to match a provider data point to a document.
     * 
     * @param provider Either a collection id string or an object with a uuid property.
     */
    _getDocumentFromProvider(provider: string|object): SR5Actor | SR5Item | void {
        if (typeof(provider) === 'string') {
            return game.actors?.get(provider) || game.items?.get(provider);
        }

        if ('uuid' in provider) {
            //@ts-ignore
            return fromUuidSync(provider.uuid);
        }

        return console.error('Provider is not a string actor id or object with uuid', provider);
    },

    /**
     * Using this actors value sources, alter roll data to swap out different values.
     * 
     * #TODO: Documentation
     * @param rollData 
     * @returns 
     */
    applyValueSources<SystemData extends object>(rollData: SystemData, valueSources: ValueSources, document: SR5Actor|SR5Item): SystemData {
        console.debug(`Shadowrun 5e | Applying value sources for ${this.name} (${this.type})`);

        for (let [value, source] of Object.entries(valueSources)) {
            // TODO: This might belong into getValueSource for readability
            const sourceValue = ValueSourcesFlow.getValue(value, source, document);
            // Avoid falsify checking as those are valid values.
            if (sourceValue === undefined) continue;
            foundry.utils.setProperty(rollData, value, sourceValue);
        }

        return rollData;
    }
}