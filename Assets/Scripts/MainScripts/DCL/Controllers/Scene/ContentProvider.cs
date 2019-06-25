﻿using DCL.Helpers;
using System.Collections.Generic;
using UnityEngine;
using System.Linq;

namespace DCL
{
    public class ContentProvider
    {
        public static bool VERBOSE = false;

        public string baseUrl;
        public List<MappingPair> contents;
        public Dictionary<string, string> fileToHash;

        [System.Serializable]
        public class MappingPair
        {
            public string file;
            public string hash;
        }


        public MappingPair GetMappingForHash(string hash)
        {
            if (contents == null)
            {
                return null;
            }

            return contents.FirstOrDefault((x) => x.hash == hash);
        }

        public void BakeHashes()
        {
            if (contents == null)
            {
                return;
            }

            if (VERBOSE)
            {
                Debug.Log("Baking hashes...");
            }

            fileToHash = new Dictionary<string, string>(contents.Count);

            for (int i = 0; i < contents.Count; i++)
            {
                MappingPair m = contents[i];
                fileToHash.Add(m.file.ToLower(), m.hash);

                if (VERBOSE)
                {
                    Debug.Log($"found file = {m.file} ... hash = {m.hash}\nfull url = {baseUrl}\\{m.hash}");
                }
            }
        }

        public virtual bool HasContentsUrl(string url)
        {
            if (string.IsNullOrEmpty(url))
            {
                return false;
            }

#if UNITY_EDITOR
            if (HasTestSchema(url))
            {
                return true;
            }
#endif
            if (fileToHash == null)
            {
                return false;
            }

            return fileToHash.ContainsKey(url.ToLower());
        }

        public virtual string GetContentsUrl(string url)
        {
            string result = "";

            if (TryGetContentsUrl(url, out result))
            {
                return result;
            }

            return null;
        }

        public virtual bool TryGetContentsUrl(string url, out string result)
        {
            url = url.ToLower();
            result = url;

            if (HasTestSchema(url))
            {
                return true;
            }

            if (fileToHash != null)
            {
                if (!fileToHash.ContainsKey(url))
                {
                    Debug.LogError(string.Format("GetContentsUrl >>> File {0} not found!!!", url));
                    return false;
                }

                result = baseUrl + fileToHash[url];
            }
            else
            {
                result = baseUrl + url;
            }

            if (VERBOSE)
            {
                Debug.Log($">>> GetContentsURL from ... {url} ... RESULTING URL... = {result}");
            }

            return true;
        }

        public bool HasTestSchema(string url)
        {
#if UNITY_EDITOR
            if (url.StartsWith("file://"))
            {
                return true;
            }

            if (url.StartsWith(TestHelpers.GetTestsAssetsPath()))
            {
                return true;
            }
#endif
            return false;
        }
    }

}
