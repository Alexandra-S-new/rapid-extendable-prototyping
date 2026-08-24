import { WEATHERS, type Season, type Weather } from '../../domain/value-objects/enums.js';
import type { WorldState } from '../../world/WorldState.js';
import type { TickContext } from '../TickContext.js';

// WeatherSystem (Subtask 2 §5, Perception 2.): würfelt neues Wetter,
// beeinflusst von Jahreszeit. Nutzt zwingend den benannten Substream
// 'weather' (02 §8), nie einen globalen RNG.

// Gewichtungen je Jahreszeit (Subtask 4, Implementierungsdetail — keine der
// Baseline-Dokumente legt konkrete Zahlen fest).
const SEASON_WEATHER_WEIGHTS: Record<Season, Record<Weather, number>> = {
  Spring: { Clear: 0.4, Rain: 0.4, Storm: 0.15, Snow: 0.05 },
  Summer: { Clear: 0.6, Rain: 0.25, Storm: 0.15, Snow: 0.0 },
  Autumn: { Clear: 0.35, Rain: 0.4, Storm: 0.2, Snow: 0.05 },
  Winter: { Clear: 0.3, Rain: 0.1, Storm: 0.1, Snow: 0.5 },
};

function sampleWeather(season: Season, roll: number): Weather {
  const weights = SEASON_WEATHER_WEIGHTS[season];
  let cumulative = 0;
  for (const weather of WEATHERS) {
    cumulative += weights[weather];
    if (roll < cumulative) return weather;
  }
  return WEATHERS[WEATHERS.length - 1]!;
}

export function runWeatherSystem(world: WorldState, ctx: TickContext): void {
  const roll = ctx.rng.stream('weather').nextFloat();
  const newWeather = sampleWeather(world.environment.season, roll);

  if (newWeather !== world.environment.weather) {
    world.environment.weather = newWeather;
    ctx.emit({ type: 'WeatherChangedEvent', weather: newWeather });
  }
}
