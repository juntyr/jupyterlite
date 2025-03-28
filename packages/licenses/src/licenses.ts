// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Licenses } from '@jupyterlab/apputils';

import { URLExt, PageConfig } from '@jupyterlab/coreutils';

import { IFederatedExtension } from '@jupyterlite/types';

/**
 * A license bundle is a collection of packages and their licenses.
 */
type ILicenseBundles = { [key: string]: Licenses.ILicenseBundle };

/**
 * The well-known name of the file. Can actually be configured by alternate
 * implementations, but the default is probably good enough for "best-effort."
 */
export const THIRD_PARTY_LICENSES = 'third-party-licenses.json';

/**
 * An empty bundle.
 */
const EMPTY_BUNDLE: Licenses.ILicenseBundle = Object.freeze({ packages: [] });

/**
 * A JupyterLite implementation of the jupyterlab_server licenses route
 */
export class LiteLicensesClient extends Licenses.LicensesClient {
  /**
   * A GET handler for the licenses
   */
  async getBundles(): Promise<Licenses.ILicenseResponse> {
    return {
      bundles: {
        ...(await this._getFederated()),
        [this.appName]: await this._getAppLicenses(),
      },
    };
  }

  /**
   * Get the download link for the requested format
   *
   * TODO: update to download after https://github.com/jupyterlab/jupyterlab/pull/17397 is released.
   */
  async getDownloadLink(options: Licenses.IDownloadOptions): Promise<string> {
    const bundles = await this.getBundles();
    const data = JSON.stringify(bundles, null, 2);

    // Create a blob with the appropriate MIME type
    const mime = options.format === 'json' ? 'application/json' : 'text/plain';
    const blob = new Blob([data], { type: mime });

    // Generate a URL for the blob
    return URL.createObjectURL(blob);
  }

  /**
   * Get the app name (or default).
   */
  protected get appName(): string {
    return PageConfig.getOption('appName') || 'JupyterLite';
  }

  /**
   * Get the well-known URL of the app licenses.
   */
  protected get appLicensesUrl(): string {
    return URLExt.join(PageConfig.getBaseUrl(), 'build', THIRD_PARTY_LICENSES);
  }

  /**
   * Get the lab extension base url.
   */
  protected get labExtensionsUrl(): string {
    return PageConfig.getOption('fullLabextensionsUrl');
  }

  /**
   * Resolve the licenses for the app distribution itself, or the empty bundle.
   */
  async _getAppLicenses(): Promise<Licenses.ILicenseBundle> {
    let bundle = EMPTY_BUNDLE;

    try {
      const response = await fetch(this.appLicensesUrl);
      bundle = response.json() as any;
    } catch (err) {
      console.warn('Could not resolve licenses for', this.appName);
    }

    return bundle;
  }

  /**
   * Resolve the licenses for all federated extensions.
   */
  async _getFederated(): Promise<ILicenseBundles> {
    const bundles: ILicenseBundles = {};
    let federated: IFederatedExtension[];

    try {
      federated = JSON.parse(PageConfig.getOption('federated_extensions'));
    } catch {
      return bundles;
    }

    const promises = [] as Promise<any>[];

    for (const ext of federated) {
      promises.push(this._getOneFederated(ext, bundles));
    }

    try {
      await Promise.all(promises);
    } catch (err) {
      console.warn('Error resolving licenses', err);
    }

    return bundles;
  }

  /**
   * Update the bundles with the extension's licenses, or the empty bundle.
   */
  async _getOneFederated(ext: IFederatedExtension, bundles: ILicenseBundles) {
    try {
      const url = URLExt.join(
        this.labExtensionsUrl,
        ext.name,
        'static',
        THIRD_PARTY_LICENSES,
      );
      const response = await fetch(url);
      bundles[ext.name] = await response.json();
    } catch {
      console.warn('Could not resolve licenses for', ext);
      bundles[ext.name] = EMPTY_BUNDLE;
    }
  }
}
