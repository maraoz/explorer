using DCL.Controllers;
using DCL.Models;
using UnityEngine;

namespace DCL.Components
{
    public class NFTShape : LoadableShape<LoadWrapper_NFT, NFTShape.Model>
    {
        [System.Serializable]
        public new class Model : LoadableShape.Model
        {
            public Color color = new Color(0.6404918f, 0.611472f, 0.8584906f); // "light purple" default, same as in explorer
        }

        public override string componentName => "NFT Shape";
        LoadWrapper_NFT loadableShape;

        public NFTShape(ParcelScene scene) : base(scene)
        {
        }

        protected override void AttachShape(DecentralandEntity entity)
        {
            if (!string.IsNullOrEmpty(model.src))
            {
                entity.meshesInfo.meshRootGameObject = UnityEngine.Object.Instantiate(Resources.Load("NFTShapeLoader")) as GameObject;

                entity.meshRootGameObject.name = componentName + " mesh";
                entity.meshRootGameObject.transform.SetParent(entity.gameObject.transform);
                entity.meshRootGameObject.transform.localPosition = Vector3.zero;
                entity.meshRootGameObject.transform.localScale = Vector3.one;
                entity.meshRootGameObject.transform.localRotation = Quaternion.identity;
                entity.meshesInfo.currentShape = this;

                entity.OnShapeUpdated += UpdateBackgroundColor;

                LoadWrapper_NFT loadableShape = null;

                if (!attachedLoaders.ContainsKey(entity.meshRootGameObject))
                {
                    loadableShape = new LoadWrapper_NFT();
                    attachedLoaders.Add(entity.meshRootGameObject, loadableShape);
                }
                else
                {
                    loadableShape = GetLoaderForEntity(entity) as LoadWrapper_NFT;
                }

                loadableShape.entity = entity;
                loadableShape.initialVisibility = model.visible;

                loadableShape.withCollisions = model.withCollisions;
                loadableShape.backgroundColor = model.color;

                loadableShape.Load(model.src, OnLoadCompleted, OnLoadFailed);
            }
            else
            {
#if UNITY_EDITOR
                Debug.LogError($"NFT SHAPE with url '{model.src}' couldn't be loaded.");
#endif
            }
        }

        protected override void DetachShape(DecentralandEntity entity)
        {
            if (entity == null || entity.meshRootGameObject == null) return;

            entity.OnShapeUpdated -= UpdateBackgroundColor;

            base.DetachShape(entity);
        }

        protected override void ConfigureColliders(DecentralandEntity entity)
        {
            CollidersManager.i.ConfigureColliders(entity.meshRootGameObject, model.withCollisions, false, entity);
        }

        void UpdateBackgroundColor(DecentralandEntity entity)
        {
            if (model.color == previousModel.color) return;

            loadableShape = GetLoaderForEntity(entity) as LoadWrapper_NFT;
            loadableShape.loaderController.UpdateBackgroundColor(model.color);
        }

        public override string ToString()
        {
            if (model == null)
                return base.ToString();

            return $"{componentName} (src = {model.src})";
        }
    }
}
