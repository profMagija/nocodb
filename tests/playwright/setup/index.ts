import { Page, selectors } from '@playwright/test';
import axios from 'axios';

const workerCount = {};

export interface NcContext {
  project: any;
  token: string;
  dbType?: string;
  // todo: Hack to resolve issue with pg resetting
  workerId?: string;
}

selectors.setTestIdAttribute('data-testid');

const setup = async ({ page, isEmptyProject }: { page: Page; isEmptyProject?: boolean }): Promise<NcContext> => {
  let dbType = process.env.CI ? process.env.E2E_DB_TYPE : process.env.E2E_DEV_DB_TYPE;
  dbType = dbType || 'sqlite';

  let workerId;
  // todo: Hack to resolve issue with pg resetting
  if (dbType === 'pg') {
    const workerIndex = process.env.TEST_PARALLEL_INDEX;
    if (!workerCount[workerIndex]) {
      workerCount[workerIndex] = 0;
    }
    workerCount[workerIndex]++;
    workerId = String(Number(workerIndex) + Number(workerCount[workerIndex]) * 4);
  }

  // if (!process.env.CI) console.time(`setup ${process.env.TEST_PARALLEL_INDEX}`);
  let response;
  try {
    response = await axios.post(`http://localhost:8080/api/v1/meta/test/reset`, {
      parallelId: process.env.TEST_PARALLEL_INDEX,
      workerId: workerId,
      dbType,
      isEmptyProject,
    });
  } catch (e) {
    console.error(`Error resetting project: ${process.env.TEST_PARALLEL_INDEX}`, e);
  }
  // if (!process.env.CI) console.timeEnd(`setup ${process.env.TEST_PARALLEL_INDEX}`);

  if (response.status !== 200 || !response.data?.token || !response.data?.project) {
    console.error('Failed to reset test data', response.data, response.status);
    throw new Error('Failed to reset test data');
  }
  const token = response.data.token;

  await page.addInitScript(
    async ({ token }) => {
      try {
        let initialLocalStorage = {};
        try {
          initialLocalStorage = JSON.parse(localStorage.getItem('nocodb-gui-v2') || '{}');
        } catch (e) {
          console.error('Failed to parse local storage', e);
        }
        window.localStorage.setItem(
          'nocodb-gui-v2',
          JSON.stringify({
            ...initialLocalStorage,
            token: token,
          })
        );
      } catch (e) {
        window.console.log(e);
      }
    },
    { token: token }
  );

  const project = response.data.project;

  await page.goto(`/#/nc/${project.id}/auth`, { waitUntil: 'networkidle' });

  return { project, token, dbType, workerId } as NcContext;
};

export default setup;
