/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {generate, download} from '@commerce-apps/raml-toolkit';
import path from 'path';
import {readJsonSync} from 'fs-extra';

import * as templateHelpers from './templateHelpers';

const PROJECT_ROOT = path.join(__dirname, '..');
const PACKAGE_JSON = path.join(PROJECT_ROOT, 'package.json');

const TEMPLATE_DIRECTORY = `${__dirname}/../templates`;
const {registerPartial, loadApiDirectory} = generate;
type ApiMetadata = generate.ApiMetadata;

// -------HELPER REGISTRATION-------
const Handlebars = generate.HandlebarsWithAmfHelpers;

require('handlebars-helpers')({handlebars: Handlebars});

/**
 * Register the custom helpers defined in our pipeline
 */
export function registerHelpers(): void {
  // eslint-disable-next-line no-undef
  const helpers: {[key: string]: Handlebars.HelperDelegate} = templateHelpers;
  const keys: string[] = Object.keys(helpers);
  keys.forEach(helper => Handlebars.registerHelper(helper, helpers[helper]));
}

/**
 * Register any customer partials we have in our pipeline
 */
export function registerPartials(): void {
  registerPartial(
    'dtoPartial',
    path.join(TEMPLATE_DIRECTORY, 'dtoPartial.ts.hbs')
  );
  registerPartial(
    'operationsPartial',
    path.join(TEMPLATE_DIRECTORY, 'operations.ts.hbs')
  );
}

function addTemplates(apis: ApiMetadata, outputBasePath: string): ApiMetadata {
  apis.addTemplate(
    path.join(TEMPLATE_DIRECTORY, 'index.ts.hbs'),
    path.join(outputBasePath, 'index.ts')
  );

  // add version template
  apis.addTemplate(
    path.join(TEMPLATE_DIRECTORY, 'version.ts.hbs'),
    path.join(outputBasePath, 'version.ts')
  );

  apis.children.forEach((api: ApiMetadata) => {
    api.addTemplate(
      path.join(TEMPLATE_DIRECTORY, 'client.ts.hbs'),
      path.join(outputBasePath, `${api.name.lowerCamelCase}.ts`)
    );
  });
  return apis;
}

/**
 * Primary driver, loads the apis and templates associated with those apis.
 *
 * @param inputDir - Directory for input
 * @param outputDir - Directory for output
 *
 * @returns - The a promise to have the ApiMetaData tree ready to be rendered
 */
export async function setupApis(
  inputDir: string,
  outputDir: string
): Promise<ApiMetadata> {
  let apis = loadApiDirectory(inputDir);
  // SDK version is not API metadata, so it is not included in the file, but it
  // is necessary for generating the SDK (as part of the user agent header).
  apis.metadata.sdkVersion = await readJsonSync(PACKAGE_JSON).version;
  await apis.init();

  apis = addTemplates(apis, outputDir);
  return apis;
}

/**
 * Searches for an API by name and downloads it to a folder.
 *
 * NOTE: Coverage passes without this function being covered.
 *  We should have some followup to figure out how to cover it.
 *  Ive spent hours trying to mock download
 *
 * @param name - Api name to search for
 * @param deployment - What deployment to build for
 * @param rootPath - Root path to download to
 *
 * @returns a promise that we will complete
 */
export async function updateApis(
  name: string,
  deployment: RegExp,
  rootPath: string
): Promise<void> {
  const matchedApis = await download.search(`"${name}"`, deployment);
  if (!(matchedApis?.length > 0)) {
    throw new Error(`No results in Exchange for '${name}'`);
  }
  const api = matchedApis.find(matchedApi => matchedApi?.assetId === name);
  if (!api) {
    throw new Error(`No exact match in Exchange for '${name}'`);
  }
  try {
    await download.downloadRestApis([api], rootPath);
  } catch (err: unknown) {
    if (err instanceof Error) {
      err.message = `Failed to download ${name}: ${err.message}`;
    }
    throw err;
  }
}
