import type { StoreContext } from '../../context';
import { ExchangeRatesRepository } from '../exchange-rates';
import { PluginDataRepository } from '../plugin-data';
import { PluginPeopleRepository } from '../plugin-people';
import { PluginsRepository } from '../plugins';
import { SettingsKvRepository } from '../settings-kv';
import { TranscriptsRepository } from '../transcripts';
import { WeatherRepository } from '../weather';

export const platformRepositories = (context: StoreContext) =>
  ({
    settingsKv: new SettingsKvRepository(context),
    weather: new WeatherRepository(context),
    exchangeRates: new ExchangeRatesRepository(context),
    plugins: new PluginsRepository(context),
    pluginData: new PluginDataRepository(context),
    pluginPeople: new PluginPeopleRepository(context),
    transcripts: new TranscriptsRepository(context),
  }) as const;
