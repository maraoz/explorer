﻿using DCL.Helpers;
using System.Collections;
using UnityEngine;

namespace Tests
{
    public class UITestsBase : TestsBase
    {
        protected override IEnumerator InitScene(bool usesWebServer = false, bool spawnCharController = true, bool spawnTestScene = true, bool spawnUIScene = true, bool debugMode = false, bool reloadUnityScene = true)
        {
            yield return base.InitScene(usesWebServer, spawnCharController, spawnTestScene, spawnUIScene, debugMode, reloadUnityScene);

            if (spawnCharController)
            {
                DCLCharacterController.i.gravity = 0f;
                TestHelpers.SetCharacterPosition(new Vector3(8f, 0f, 8f));
            }
        }

        protected Vector2 CalculateAlignedAnchoredPosition(Rect parentRect, Rect elementRect, string vAlign = "center", string hAlign = "center")
        {
            Vector2 result = Vector2.zero;

            switch (vAlign)
            {
                case "top":
                    result.y = -elementRect.height / 2;
                    break;
                case "bottom":
                    result.y = -(parentRect.height - elementRect.height / 2);
                    break;
                default: // center
                    result.y = -parentRect.height / 2;
                    break;
            }

            switch (hAlign)
            {
                case "left":
                    result.x = elementRect.width / 2;
                    break;
                case "right":
                    result.x = (parentRect.width - elementRect.width / 2);
                    break;
                default: // center
                    result.x = parentRect.width / 2;
                    break;
            }

            return result;
        }
    }
}
