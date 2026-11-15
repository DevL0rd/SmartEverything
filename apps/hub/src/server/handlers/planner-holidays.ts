import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { holidayRegions } from '../../planner/holidays/rules';
import { bound } from '../router';

export const plannerHolidayRoutes = () =>
  ({
    readPlannerHolidayRegions: bound(E.readPlannerHolidayRegions, () => [...holidayRegions()]),
  }) as const;
