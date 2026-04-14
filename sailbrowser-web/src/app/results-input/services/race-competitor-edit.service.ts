import { inject, Injectable } from '@angular/core';
import { SeriesEntryStore } from './series-entry-store';
import { RaceCompetitorStore } from './race-competitor-store';
import { Handicap } from 'app/scoring/model/handicap';
import { RaceCompetitor } from '../model/race-competitor';

export type EditScope = 'raceOnly' | 'linkedBySeriesEntry';

export type EditOperation =
  | { type: 'setHelm'; value: string; scope: EditScope }
  | { type: 'setCrew'; value: string; scope: EditScope }
  | { type: 'setBoatClass'; value: string; scope: EditScope }
  | { type: 'setSailNumber'; value: number; scope: EditScope }
  | { type: 'setHandicap'; scheme: Handicap['scheme']; value: number; scope: EditScope }
  | { type: 'deleteCompetitor'; scope: EditScope };

export interface EditRaceCompetitorCommand {
  competitorId: string;
  operation: EditOperation;
}

@Injectable({ providedIn: 'root' })
export class RaceCompetitorEditService {
  private readonly competitors = inject(RaceCompetitorStore);
  private readonly seriesEntries = inject(SeriesEntryStore);

  async apply(command: EditRaceCompetitorCommand): Promise<void> {
    const target = this.competitors.selectedCompetitors().find(c => c.id === command.competitorId);
    if (!target) {
      throw new Error(`Competitor not found: ${command.competitorId}`);
    }

    const impacted = await this.resolveImpacted(target, command.operation.scope);
    if (impacted.length === 0) return;
    if (this.isNoOp(impacted, command.operation)) return;

    const touchedSeriesEntryIds = new Set<string>(impacted.map(c => c.seriesEntryId));
    if (command.operation.type === 'deleteCompetitor') {
      for (const comp of impacted) {
        await this.competitors.deleteResult(comp.id);
      }
      await this.cleanupOrphanedSeriesEntries(target.seriesId, touchedSeriesEntryIds);
      return;
    }

    let newSeriesEntryId: string | undefined;
    if (
      command.operation.type === 'setHelm' ||
      command.operation.type === 'setBoatClass' ||
      command.operation.type === 'setSailNumber'
    ) {
      const identity = this.nextIdentity(target, command.operation);
      const merged = await this.findOrCreateSeriesEntry(target.seriesId, identity, target.handicaps);
      newSeriesEntryId = merged.id;
      touchedSeriesEntryIds.add(merged.id);
    }

    for (const comp of impacted) {
      const changes = this.buildCompetitorChanges(comp, command.operation, newSeriesEntryId);
      if (Object.keys(changes).length > 0) {
        await this.competitors.updateResult(comp.id, changes);
      }
    }

    if (command.operation.scope === 'linkedBySeriesEntry' && impacted.length > 0) {
      const entryId = impacted[0].seriesEntryId;
      const entryChanges = this.buildSeriesEntryChanges(command.operation);
      if (Object.keys(entryChanges).length > 0) {
        await this.seriesEntries.updateEntry(entryId, entryChanges);
      }
    }

    await this.cleanupOrphanedSeriesEntries(target.seriesId, touchedSeriesEntryIds);
  }

  private async resolveImpacted(target: RaceCompetitor, scope: EditScope): Promise<RaceCompetitor[]> {
    if (scope === 'raceOnly') return [target];
    const allSeriesCompetitors = await this.competitors.getSeriesCompetitors(target.seriesId);
    return allSeriesCompetitors.filter(c => c.seriesEntryId === target.seriesEntryId);
  }

  private buildCompetitorChanges(
    competitor: RaceCompetitor,
    operation: EditOperation,
    newSeriesEntryId?: string,
  ): Partial<RaceCompetitor> {
    switch (operation.type) {
      case 'setHelm':
        return { helm: operation.value, ...(newSeriesEntryId ? { seriesEntryId: newSeriesEntryId } : {}) };
      case 'setCrew':
        return { crew: operation.value };
      case 'setBoatClass':
        return { boatClass: operation.value, ...(newSeriesEntryId ? { seriesEntryId: newSeriesEntryId } : {}) };
      case 'setSailNumber':
        return { sailNumber: operation.value, ...(newSeriesEntryId ? { seriesEntryId: newSeriesEntryId } : {}) };
      case 'setHandicap': {
        const withoutScheme = (competitor.handicaps ?? []).filter(h => h.scheme !== operation.scheme);
        return { handicaps: [...withoutScheme, { scheme: operation.scheme, value: operation.value }] };
      }
      default:
        return {};
    }
  }

  private buildSeriesEntryChanges(operation: Exclude<EditOperation, { type: 'deleteCompetitor' }>): Record<string, unknown> {
    switch (operation.type) {
      case 'setHelm':
        return { helm: operation.value };
      case 'setCrew':
        return { crew: operation.value };
      case 'setBoatClass':
        return { boatClass: operation.value };
      case 'setSailNumber':
        return { sailNumber: operation.value };
      case 'setHandicap':
        return {};
    }
  }

  private nextIdentity(target: RaceCompetitor, operation: Extract<EditOperation, { type: 'setHelm' | 'setBoatClass' | 'setSailNumber' }>) {
    return {
      helm: operation.type === 'setHelm' ? operation.value : target.helm,
      boatClass: operation.type === 'setBoatClass' ? operation.value : target.boatClass,
      sailNumber: operation.type === 'setSailNumber' ? operation.value : target.sailNumber,
      crew: target.crew,
    };
  }

  private async findOrCreateSeriesEntry(
    seriesId: string,
    identity: { helm: string; boatClass: string; sailNumber: number; crew?: string },
    handicaps: Handicap[],
  ): Promise<{ id: string }> {
    const all = await this.seriesEntries.getSeriesEntries(seriesId);
    const existing = all.find(
      e =>
        e.seriesId === seriesId &&
        e.helm === identity.helm &&
        e.boatClass === identity.boatClass &&
        e.sailNumber === identity.sailNumber,
    );
    if (existing) {
      await this.seriesEntries.updateEntry(existing.id, { handicaps });
      return { id: existing.id };
    }
    const id = await this.seriesEntries.addEntry({
      seriesId,
      helm: identity.helm,
      crew: identity.crew,
      boatClass: identity.boatClass,
      sailNumber: identity.sailNumber,
      handicaps,
      tags: [],
    });
    return { id };
  }

  private async cleanupOrphanedSeriesEntries(seriesId: string, touchedSeriesEntryIds: Set<string>): Promise<void> {
    const seriesCompetitors = await this.competitors.getSeriesCompetitors(seriesId);
    const referenced = new Set(seriesCompetitors.map(c => c.seriesEntryId));
    for (const id of touchedSeriesEntryIds) {
      if (!id || referenced.has(id)) continue;
      await this.seriesEntries.deleteEntry(id);
    }
  }

  private isNoOp(impacted: RaceCompetitor[], operation: EditOperation): boolean {
    switch (operation.type) {
      case 'setHelm':
        return impacted.every(c => c.helm === operation.value);
      case 'setCrew':
        return impacted.every(c => (c.crew ?? '') === operation.value);
      case 'setBoatClass':
        return impacted.every(c => c.boatClass === operation.value);
      case 'setSailNumber':
        return impacted.every(c => c.sailNumber === operation.value);
      case 'setHandicap':
        return impacted.every(c => c.handicaps.some(h => h.scheme === operation.scheme && h.value === operation.value));
      default:
        return false;
    }
  }
}
